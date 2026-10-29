using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Sync;

public sealed record FlushOutcome(int Synced, int Failed, ErrorKind? StoppedBy);

/// <summary>
/// Keeps the local database and the server in step: pulls changes (patients, bills) with a keyset
/// cursor, and sends queued visits one at a time through the idempotent register_visit function.
/// Same rules as the web app's offline layer.
/// </summary>
public sealed class SyncEngine
{
    private const int PageSize = 1000;
    private const int InvoiceHistoryDays = 90;
    private static readonly TimeSpan StuckAfter = TimeSpan.FromMinutes(2);

    private readonly LocalStore _store;
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly SemaphoreSlim _flushing = new(1, 1);

    public SyncEngine(LocalStore store, SupabaseApi api, string organizationId)
    {
        _store = store;
        _api = api;
        _organizationId = organizationId;
    }

    private sealed record Cursor(string UpdatedAt, string Id);

    private Cursor? LoadCursor(string key)
    {
        var raw = _store.GetMeta(key);
        return raw is null ? null : JsonSerializer.Deserialize<Cursor>(raw);
    }

    private static string AfterCursor(Cursor c) =>
        $"({"updated_at.gt." + c.UpdatedAt},and(updated_at.eq.{c.UpdatedAt},id.gt.{c.Id}))";

    /// <summary>Pages through rows changed since the saved cursor. Returns how many rows were applied.</summary>
    private async Task<int> PullAsync(string table, string columns, string cursorKey, Action<JsonElement> apply, string? firstRunFilter, CancellationToken ct)
    {
        var cursor = LoadCursor(cursorKey);
        var applied = 0;

        for (;;)
        {
            var query = $"select={columns}&organization_id=eq.{_organizationId}&order=updated_at.asc,id.asc&limit={PageSize}";
            query += cursor is not null ? "&or=" + Uri.EscapeDataString(AfterCursor(cursor)) : firstRunFilter is not null ? "&" + firstRunFilter : "";

            var result = await _api.SelectAsync(table, query, ct);
            if (!result.Ok) throw new SyncException(result);

            var rows = result.Body is { ValueKind: JsonValueKind.Array } arr ? arr.EnumerateArray().ToList() : [];
            if (rows.Count == 0) break;

            _store.InTransaction(() => { foreach (var row in rows) apply(row); });
            var last = rows[^1];
            cursor = new Cursor(last.GetProperty("updated_at").GetString()!, last.GetProperty("id").GetString()!);
            _store.SetMeta(cursorKey, JsonSerializer.Serialize(cursor));
            applied += rows.Count;

            if (rows.Count < PageSize) break;
        }
        return applied;
    }

    public Task<int> PullPatientsAsync(CancellationToken ct = default) =>
        PullAsync("patients", "id,patient_id,full_name,phone,gender,date_of_birth,is_active,updated_at", "patients_cursor", row =>
        {
            _store.UpsertPatient(new Patient(
                row.GetProperty("id").GetString()!, row.GetProperty("patient_id").GetString()!,
                row.GetProperty("full_name").GetString()!, row.GetProperty("phone").GetString() ?? "",
                Opt(row, "gender"), Opt(row, "date_of_birth")));
        }, null, ct);

    public Task<int> PullInvoicesAsync(CancellationToken ct = default)
    {
        var floor = DateTimeOffset.UtcNow.AddDays(-InvoiceHistoryDays).ToString("O");
        return PullAsync("invoices", "id,invoice_number,patient_id,total_amount,paid_amount,payment_status,created_at,updated_at", "invoices_cursor", row =>
        {
            _store.UpsertInvoice(new Invoice(
                row.GetProperty("id").GetString()!, row.GetProperty("invoice_number").GetString()!,
                row.GetProperty("patient_id").GetString()!, Num(row, "total_amount"), Num(row, "paid_amount"),
                Opt(row, "payment_status"), DateTimeOffset.Parse(row.GetProperty("created_at").GetString()!).ToString("O")));
        }, "created_at=gte." + Uri.EscapeDataString(floor), ct);
    }

    private const string CatalogKey = "catalog_synced_at";
    private static readonly TimeSpan CatalogMaxAge = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Copies the test list, packages, doctors, labs and centers to this PC. They change rarely, so this
    /// runs at most every 10 minutes unless forced. A failed refresh never wipes a good copy.
    /// Returns false when it was skipped as too soon.
    /// </summary>
    public async Task<bool> PullCatalogAsync(bool force = false, CancellationToken ct = default)
    {
        if (!force && long.TryParse(_store.GetMeta(CatalogKey), out var last) &&
            DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(last) < CatalogMaxAge)
            return false;

        string Org(string table, string cols, string extra = "") => $"select={cols}&organization_id=eq.{_organizationId}{extra}";
        var calls = await Task.WhenAll(
            _api.SelectAsync("tests", Org("tests", "id,test_id,name,price,category_id", "&is_active=eq.true"), ct),
            _api.SelectAsync("test_packages", Org("test_packages", "id,name,price", "&is_active=eq.true"), ct),
            _api.SelectAsync("test_package_tests", "select=package_id,test_id", ct),
            _api.SelectAsync("doctors", Org("doctors", "id,name,specialization,commission_percentage", "&is_active=eq.true"), ct),
            _api.SelectAsync("labs", Org("labs", "id,name,lab_code", "&is_active=eq.true&order=name.asc"), ct),
            _api.SelectAsync("collection_centers", Org("collection_centers", "id,name,code,lab_id", "&is_active=eq.true&order=name.asc"), ct));

        // Throw before touching local data so a failed refresh keeps what we have.
        foreach (var call in calls) if (!call.Ok) throw new SyncException(call);
        IEnumerable<JsonElement> Rows(int i) => calls[i].Body is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray() : [];

        var testsByPackage = Rows(2).GroupBy(r => r.GetProperty("package_id").GetString()!)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<string>)g.Select(r => r.GetProperty("test_id").GetString()!).ToList());

        var catalog = new Catalog(
            Rows(0).Select(r => new CatalogTest(Str(r, "id")!, Str(r, "test_id"), Str(r, "name")!, Num(r, "price"), Str(r, "category_id"))).ToList(),
            Rows(1).Select(r => new TestPackage(Str(r, "id")!, Str(r, "name")!, Num(r, "price"),
                testsByPackage.GetValueOrDefault(Str(r, "id")!) ?? [])).ToList(),
            Rows(3).Select(r => new Doctor(Str(r, "id")!, Str(r, "name")!, Str(r, "specialization"), Num(r, "commission_percentage"))).ToList(),
            Rows(4).Select(r => new LabRef(Str(r, "id")!, Str(r, "name")!, Str(r, "lab_code") ?? "")).ToList(),
            Rows(5).Select(r => new CenterRef(Str(r, "id")!, Str(r, "name")!, Str(r, "code") ?? "", Str(r, "lab_id")!)).ToList());

        _store.ReplaceCatalog(catalog);
        _store.SetMeta(CatalogKey, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
        return true;
    }

    /// <summary>Sends queued visits one at a time, oldest first. Overlapping calls are skipped, not doubled.</summary>
    public async Task<FlushOutcome> FlushOutboxAsync(CancellationToken ct = default)
    {
        if (!await _flushing.WaitAsync(0, ct)) return new FlushOutcome(0, 0, null);
        try
        {
            _store.RequeueStuckVisits(StuckAfter);
            int synced = 0, failed = 0;

            for (;;)
            {
                var item = _store.NextPendingVisit();
                if (item is null) return new FlushOutcome(synced, failed, null);

                _store.SetVisitStatus(item.VisitId, "syncing");
                var payload = JsonDocument.Parse(item.PayloadJson).RootElement.Clone();
                var result = await _api.RpcAsync("register_visit", new { p_payload = payload }, ct);

                if (result.Ok && result.Body is { ValueKind: JsonValueKind.Object } body)
                {
                    ApplyVisitResult(payload, body);
                    _store.SetVisitStatus(item.VisitId, "done", resultJson: body.GetRawText());
                    synced++;
                    continue;
                }

                var kind = ErrorClassifier.Classify(result);
                var message = result.ErrorMessage ?? "Sync failed";
                if (kind == ErrorKind.Permanent)
                {
                    _store.SetVisitStatus(item.VisitId, "failed", message, countAttempt: true);
                    failed++;
                    continue;
                }

                _store.SetVisitStatus(item.VisitId, "pending", message, countAttempt: true);
                return new FlushOutcome(synced, failed, kind);
            }
        }
        finally { _flushing.Release(); }
    }

    /// <summary>Replaces the provisional local patient with what the server decided.</summary>
    private void ApplyVisitResult(JsonElement payload, JsonElement result)
    {
        if (!payload.TryGetProperty("patient", out var patient) || !patient.TryGetProperty("new", out var created)) return;

        var localId = created.GetProperty("id").GetString()!;
        var serverId = result.TryGetProperty("patient_uuid", out var u) ? u.GetString() : null;

        if (serverId is not null && serverId != localId)
        {
            // The server matched an existing patient by phone; drop our provisional copy.
            _store.DeletePatient(localId);
        }
        else if (result.TryGetProperty("patient_code", out var code) && code.GetString() is { } patientCode)
        {
            var row = _store.GetPatient(localId);
            if (row is not null) _store.UpsertPatient(row with { PatientCode = patientCode, Pending = false });
        }
    }

    private static string? Str(JsonElement row, string name) => Opt(row, name);

    private static string? Opt(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static decimal Num(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;
}

public sealed class SyncException(ApiResult result) : Exception(result.ErrorMessage ?? $"HTTP {result.Status}")
{
    public ApiResult Result { get; } = result;
}
