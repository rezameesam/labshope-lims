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

    private static string? Opt(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static decimal Num(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;
}

public sealed class SyncException(ApiResult result) : Exception(result.ErrorMessage ?? $"HTTP {result.Status}")
{
    public ApiResult Result { get; } = result;
}
