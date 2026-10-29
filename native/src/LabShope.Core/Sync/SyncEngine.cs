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
            // Never overwrite an edit made here that hasn't reached the server yet.
            if (_store.HasWaitingPatientEdit(row.GetProperty("id").GetString()!)) return;
            _store.UpsertPatient(new Patient(
                row.GetProperty("id").GetString()!, row.GetProperty("patient_id").GetString()!,
                row.GetProperty("full_name").GetString()!, row.GetProperty("phone").GetString() ?? "",
                Opt(row, "gender"), Opt(row, "date_of_birth")));
        }, null, ct);

    private const int BookingHistoryDays = 90;

    /// <summary>Pulls booking requests made on the website (the last 90 days on first run, then only changes).</summary>
    public Task<int> PullBookingsAsync(CancellationToken ct = default)
    {
        var floor = DateTimeOffset.UtcNow.AddDays(-BookingHistoryDays).ToString("yyyy-MM-dd");
        return PullAsync("booking_requests", "id,full_name,phone,email,booking_type,preferred_date,test_details,notes,status,patient_id,created_at,updated_at", "bookings_cursor", row =>
        {
            _store.UpsertBooking(new BookingRequest(
                row.GetProperty("id").GetString()!, Opt(row, "full_name") ?? "", Opt(row, "phone") ?? "", Opt(row, "email"), Opt(row, "booking_type") ?? "",
                Opt(row, "preferred_date"), Opt(row, "test_details"), Opt(row, "notes"), Opt(row, "status") ?? "new", Opt(row, "patient_id"),
                Opt(row, "created_at") ?? ""), fromServer: true);
        }, "created_at=gte." + floor, ct);
    }

    private const int WorklistHistoryDays = 30;

    /// <summary>Pulls the lab's ordered tests and their results (the last 30 days on first run, then only changes).</summary>
    public Task<int> PullPatientTestsAsync(CancellationToken ct = default)
    {
        var floor = DateTimeOffset.UtcNow.AddDays(-WorklistHistoryDays).ToString("yyyy-MM-dd");
        return PullAsync("patient_tests", "id,patient_id,test_name,test_date,status,result,result_value,result_unit,normal_range_text,is_abnormal,result_items,external_lab_id,outsource_cost,updated_at", "patient_tests_cursor", row =>
        {
            _store.UpsertPatientTest(new PatientTest(
                row.GetProperty("id").GetString()!, row.GetProperty("patient_id").GetString()!, row.GetProperty("test_name").GetString()!,
                Opt(row, "test_date") ?? "", Opt(row, "status") ?? "pending", Opt(row, "result"),
                NumOrNull(row, "result_value"), Opt(row, "result_unit"), Opt(row, "normal_range_text"),
                row.TryGetProperty("is_abnormal", out var a) && a.ValueKind == JsonValueKind.True,
                ResultItemsJson: row.TryGetProperty("result_items", out var items) && items.ValueKind == JsonValueKind.Array ? items.GetRawText() : null,
                ExternalLabId: Opt(row, "external_lab_id"), OutsourceCost: NumOrNull(row, "outsource_cost")), fromServer: true);
        }, "test_date=gte." + floor, ct);
    }

    public Task<int> PullInvoicesAsync(CancellationToken ct = default)
    {
        var floor = DateTimeOffset.UtcNow.AddDays(-InvoiceHistoryDays).ToString("O");
        return PullAsync("invoices", "id,invoice_number,patient_id,total_amount,paid_amount,payment_status,created_at,updated_at", "invoices_cursor", row =>
        {
            var id = row.GetProperty("id").GetString()!;
            _store.UpsertInvoice(new Invoice(
                id, row.GetProperty("invoice_number").GetString()!,
                row.GetProperty("patient_id").GetString()!, Num(row, "total_amount"), Num(row, "paid_amount"),
                Opt(row, "payment_status"), DateTimeOffset.Parse(row.GetProperty("created_at").GetString()!).ToString("O")));
            // Money taken on this PC that the server hasn't confirmed yet still counts.
            var waiting = _store.UnsyncedPaymentTotal(id);
            if (waiting > 0) _store.SetInvoicePaid(id, Num(row, "paid_amount") + waiting);
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
            _api.SelectAsync("tests", Org("tests", "id,test_id,name,price,category_id,unit,normal_range_text,normal_range_min,normal_range_max", "&is_active=eq.true"), ct),
            _api.SelectAsync("test_packages", Org("test_packages", "id,name,price", "&is_active=eq.true"), ct),
            _api.SelectAsync("test_package_tests", "select=package_id,test_id", ct),
            _api.SelectAsync("doctors", Org("doctors", "id,name,specialization,commission_percentage", "&is_active=eq.true"), ct),
            _api.SelectAsync("labs", Org("labs", "id,name,lab_code", "&is_active=eq.true&order=name.asc"), ct),
            _api.SelectAsync("collection_centers", Org("collection_centers", "id,name,code,lab_id", "&is_active=eq.true&order=name.asc"), ct),
            _api.SelectAsync("test_categories", Org("test_categories", "id,name"), ct),
            // The lab's own templates, plus any shared ones (no organisation), like the website.
            _api.SelectAsync("test_templates", $"select=id,name,organization_id,test_category,test_id,header_template,footer_template,result_format,include_normal_range,include_abnormal_flag,include_notes,is_default&or=(organization_id.eq.{_organizationId},organization_id.is.null)&order=created_at.asc", ct),
            _api.SelectAsync("external_labs", Org("external_labs", "id,name,code,phone", "&is_active=eq.true&order=name.asc"), ct));

        // Throw before touching local data so a failed refresh keeps what we have.
        foreach (var call in calls) if (!call.Ok) throw new SyncException(call);
        IEnumerable<JsonElement> Rows(int i) => calls[i].Body is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray() : [];

        var testsByPackage = Rows(2).GroupBy(r => r.GetProperty("package_id").GetString()!)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<string>)g.Select(r => r.GetProperty("test_id").GetString()!).ToList());

        var catalog = new Catalog(
            Rows(0).Select(r => new CatalogTest(Str(r, "id")!, Str(r, "test_id"), Str(r, "name")!, Num(r, "price"), Str(r, "category_id"),
                Str(r, "unit"), Str(r, "normal_range_text"), NumOrNull(r, "normal_range_min"), NumOrNull(r, "normal_range_max"))).ToList(),
            Rows(1).Select(r => new TestPackage(Str(r, "id")!, Str(r, "name")!, Num(r, "price"),
                testsByPackage.GetValueOrDefault(Str(r, "id")!) ?? [])).ToList(),
            Rows(3).Select(r => new Doctor(Str(r, "id")!, Str(r, "name")!, Str(r, "specialization"), Num(r, "commission_percentage"))).ToList(),
            Rows(4).Select(r => new LabRef(Str(r, "id")!, Str(r, "name")!, Str(r, "lab_code") ?? "")).ToList(),
            Rows(5).Select(r => new CenterRef(Str(r, "id")!, Str(r, "name")!, Str(r, "code") ?? "", Str(r, "lab_id")!)).ToList(),
            Rows(6).Select(r => new TestCategory(Str(r, "id")!, Str(r, "name") ?? "")).ToList(),
            Rows(7).Select(r => new ReportTemplate(Str(r, "id")!, Str(r, "name") ?? "", Str(r, "organization_id"), Str(r, "test_category"), Str(r, "test_id"),
                Str(r, "header_template"), Str(r, "footer_template"), Str(r, "result_format") ?? "table",
                Flag(r, "include_normal_range", true), Flag(r, "include_abnormal_flag", true), Flag(r, "include_notes", false), Flag(r, "is_default", false))).ToList(),
            Rows(8).Select(r => new ExternalLab(Str(r, "id")!, Str(r, "name") ?? "", Str(r, "code"), Str(r, "phone"))).ToList());

        _store.ReplaceCatalog(catalog);
        _store.SetMeta(CatalogKey, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
        return true;
    }

    private const string BrandingKey = "branding_synced_at";
    private static readonly TimeSpan BrandingMaxAge = TimeSpan.FromHours(6);

    /// <summary>
    /// Refreshes the lab's name, address, phone, report wording and logo (at most every 6 hours unless forced), so printed
    /// pages look like the website's. The logo is stored as an embedded image so printing works offline.
    /// </summary>
    public async Task<bool> PullBrandingAsync(string slug, string fallbackName, bool force = false, CancellationToken ct = default)
    {
        if (!force && long.TryParse(_store.GetMeta(BrandingKey), out var last) &&
            DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(last) < BrandingMaxAge)
            return false;

        var result = await _api.RpcAsync("get_public_organization_context", new { _domain = (string?)null, _slug = slug }, ct);
        if (!result.Ok) throw new SyncException(result);
        if (result.Body is not { ValueKind: JsonValueKind.Object } body) return false;

        var fresh = Branding.FromContext(body.GetRawText(), fallbackName);
        if (fresh is null) return false;

        // Download the logo only when its address changed.
        var old = _store.GetBranding(fallbackName);
        string? dataUri = old.LogoUrl == fresh.LogoUrl ? old.LogoDataUri : null;
        if (fresh.LogoUrl is { Length: > 0 } url && dataUri is null && await _api.DownloadImageAsync(url, ct: ct) is { } img)
            dataUri = $"data:{img.ContentType};base64,{Convert.ToBase64String(img.Bytes)}";

        // Where patients log in: the lab's main web address (the website sends patients to the address they were on).
        var domains = await _api.SelectAsync("organization_domains", $"select=domain,is_primary&organization_id=eq.{_organizationId}&order=is_primary.desc&limit=1", ct);
        if (domains.Ok && domains.Body is { ValueKind: JsonValueKind.Array } d && d.GetArrayLength() > 0 && Opt(d[0], "domain") is { Length: > 0 } host)
            _store.SetMeta("portal_host", host);

        _store.SaveBranding(fresh with { LogoDataUri = dataUri });
        _store.SetMeta(BrandingKey, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
        return true;
    }

    /// <summary>
    /// Emails patients that their results are ready, once every test of the visit is finished and confirmed by the server.
    /// Uses the website's own wording, layout and send-email function. Returns how many emails were sent.
    /// </summary>
    public async Task<int> SendReadyNotificationsAsync(string slug, string labName, CancellationToken ct = default)
    {
        var sent = 0;
        foreach (var (patientId, testDate) in _store.PendingReadyNotifications())
        {
            var names = _store.NamesIfAllConfirmedComplete(patientId, testDate);
            if (names.Count == 0) continue; // not everything is finished yet: wait

            var patient = await _api.SelectAsync("patients", $"select=full_name,email&id=eq.{patientId}&limit=1", ct);
            if (patient.NetworkFailure || ErrorClassifier.Classify(patient) is ErrorKind.Transient or ErrorKind.Auth) break; // try again at the next sync
            var row = patient.Body is { ValueKind: JsonValueKind.Array } a && a.GetArrayLength() > 0 ? a[0] : (JsonElement?)null;
            var email = row is { } r ? Opt(r, "email") : null;
            if (row is null || string.IsNullOrWhiteSpace(email)) { _store.RemoveReadyNotification(patientId, testDate); continue; } // no address: nothing to send (the website does the same)

            var texts = await NotificationTextsAsync(ct);
            var portal = $"https://{_store.GetMeta("portal_host") ?? slug + ".labshope.com"}/auth/patient";
            var context = new Dictionary<string, string>
            {
                ["patient_name"] = Opt(row.Value, "full_name") ?? "", ["test_list"] = string.Join(", ", names),
                ["test_count"] = names.Count.ToString(), ["portal_url"] = portal,
            };
            var subject = Notify.NotificationTemplates.Render(texts.Subject, context);
            var message = Notify.NotificationTemplates.Render(texts.Message, context);

            var brand = Notify.EmailBrand.From(_store.GetBranding(labName), _store.GetMeta("portal_host") ?? slug + ".labshope.com");
            // Same as the website: add the lab's website to the message unless it is already there.
            var withSite = message.Contains(brand.Website, StringComparison.OrdinalIgnoreCase) ? message : $"{message}\n\nWebsite: {brand.Website}";
            var response = await _api.FunctionAsync("send-email", new
            {
                to = email, subject,
                htmlContent = Notify.EmailTemplate.Html(subject, withSite, brand, DateTime.Now.Year),
                textContent = Notify.EmailTemplate.Text(subject, withSite, brand),
                patientId, organizationId = _organizationId,
            }, ct);

            if (response.NetworkFailure || ErrorClassifier.Classify(response) is ErrorKind.Transient or ErrorKind.Auth) break;
            var ok = response.Ok && response.Body is { ValueKind: JsonValueKind.Object } b && b.TryGetProperty("success", out var s) && s.ValueKind == JsonValueKind.True;
            if (!ok) _store.SetMeta("notify_last_error", response.ErrorMessage ?? "The email could not be sent.");
            _store.RemoveReadyNotification(patientId, testDate); // sent, or refused for good: never send twice
            if (ok) sent++;
        }
        return sent;
    }

    /// <summary>The lab's own wording from its settings (then the platform's), else the website's defaults.</summary>
    private async Task<(string Subject, string Message)> NotificationTextsAsync(CancellationToken ct)
    {
        string? subject = null, message = null;
        const string keys = "(notification_all_tests_ready_subject,notification_all_tests_ready_message)";
        foreach (var (table, filter) in new[] { ("organization_settings", $"&organization_id=eq.{_organizationId}"), ("system_settings", "") })
        {
            var res = await _api.SelectAsync(table, $"select=setting_key,setting_value&setting_key=in.{keys}{filter}", ct);
            if (!res.Ok || res.Body is not { ValueKind: JsonValueKind.Array } rows) continue;
            foreach (var r in rows.EnumerateArray())
            {
                var key = Opt(r, "setting_key"); var value = Opt(r, "setting_value");
                if (string.IsNullOrWhiteSpace(value)) continue;
                if (key == "notification_all_tests_ready_subject") subject ??= value;
                if (key == "notification_all_tests_ready_message") message ??= value;
            }
            if (subject is not null && message is not null) break;
        }
        return (subject ?? Notify.NotificationTemplates.AllTestsReadySubject, message ?? Notify.NotificationTemplates.AllTestsReadyMessage);
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
                var isPayment = item.Kind == "payment";
                var isResult = item.Kind == "result";
                var isPatientEdit = item.Kind == "patient";
                var isBooking = item.Kind == "booking";
                var isOutsource = item.Kind == "outsource";
                var table = isPatientEdit ? "patients" : isBooking ? "booking_requests" : "patient_tests";
                var result = isResult || isPatientEdit || isBooking || isOutsource
                    ? await _api.PatchAsync(table, $"id=eq.{payload.GetProperty("id").GetString()}&organization_id=eq.{payload.GetProperty("organization_id").GetString()}", payload.GetProperty("patch"), ct)
                    : await _api.RpcAsync(isPayment ? "record_payment" : "register_visit", new { p_payload = payload }, ct);

                // A result update that changed no row was refused (not found, or not allowed): treat it as a permanent refusal.
                var isRowPatch = isResult || isPatientEdit || isBooking || isOutsource;
                if (isRowPatch && result.Ok && result.Body is { ValueKind: JsonValueKind.Array } changed && changed.GetArrayLength() == 0)
                    result = new ApiResult(403, null, "42501", isPatientEdit ? "The server would not accept this change (patient not found, or not allowed)." : isBooking ? "The server would not accept this change (booking not found, or not allowed)." : isOutsource ? "The server would not accept sending this test to an external lab (test not found, or not allowed)." : "The server would not accept this result (test not found, or not allowed).");

                if (result.Ok && (isRowPatch ? result.Body is { ValueKind: JsonValueKind.Array } : result.Body is { ValueKind: JsonValueKind.Object }))
                {
                    var body = result.Body!.Value;
                    if (isPayment) _store.MarkPaymentSynced(item.VisitId);
                    else if (isResult)
                    {
                        var testId = payload.GetProperty("id").GetString()!;
                        _store.ClearTestWaiting(testId, item.VisitId);
                        // The result is confirmed on the server: once every test of this visit is done, the patient is told.
                        if (_store.GetPatientTest(testId) is { } finished) _store.QueueReadyNotification(finished.PatientId, finished.TestDate);
                    }
                    else if (isPatientEdit) { /* nothing to clear: the next pull confirms it */ }
                    else if (isBooking) _store.ClearBookingWaiting(payload.GetProperty("id").GetString()!);
                    else if (isOutsource) _store.ClearTestWaiting(payload.GetProperty("id").GetString()!, item.VisitId);
                    else ApplyVisitResult(item.VisitId, payload, body);
                    _store.SetVisitStatus(item.VisitId, "done", resultJson: body.GetRawText());
                    synced++;
                    continue;
                }

                var kind = ErrorClassifier.Classify(result);
                var message = result.ErrorMessage ?? "Sync failed";
                if (kind == ErrorKind.Permanent)
                {
                    if (isPayment) RevertPayment(payload);
                    if (isResult) RevertResult(payload);
                    if (isPatientEdit) RevertPatientEdit(payload);
                    if (isBooking) RevertBooking(payload);
                    if (isOutsource) RevertOutsource(payload);
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
    /// <summary>The server refused a payment: take it back off the bill so the screen shows the truth.</summary>
    private void RevertPayment(JsonElement payload)
    {
        var paymentId = payload.GetProperty("payment_id").GetString()!;
        var invoiceId = payload.GetProperty("invoice_id").GetString()!;
        var amount = payload.GetProperty("amount").GetDecimal();
        var bill = _store.GetInvoice(invoiceId);
        _store.RemovePayment(paymentId);
        if (bill is not null) _store.SetInvoicePaid(invoiceId, Math.Max(bill.PaidAmount - amount, 0));
    }

    /// <summary>The server refused to send a test to an external lab: show it as not outsourced again.</summary>
    private void RevertOutsource(JsonElement payload)
    {
        var id = payload.GetProperty("id").GetString()!;
        if (_store.GetPatientTest(id) is { } test) _store.UpsertPatientTest(test with { ExternalLabId = null, OutsourceCost = null });
    }

    /// <summary>The server refused a booking change: show the booking as it was.</summary>
    private void RevertBooking(JsonElement payload)
    {
        var id = payload.GetProperty("id").GetString()!;
        var prev = payload.GetProperty("previous");
        if (_store.GetBooking(id) is { } now)
            _store.UpsertBooking(now with { Status = Opt(prev, "status") ?? now.Status, PatientId = Opt(prev, "patient_id"), Waiting = false });
    }

    /// <summary>The server refused a patient change: put the old details back.</summary>
    private void RevertPatientEdit(JsonElement payload)
    {
        var id = payload.GetProperty("id").GetString()!;
        var prev = payload.GetProperty("previous");
        if (_store.GetPatient(id) is { } now)
            _store.UpsertPatient(now with { FullName = Opt(prev, "full_name") ?? now.FullName, Phone = Opt(prev, "phone") ?? now.Phone, Gender = Opt(prev, "gender"), DateOfBirth = Opt(prev, "date_of_birth") });
    }

    /// <summary>The server refused a result: put the test back on the worklist so it can be entered again.</summary>
    private void RevertResult(JsonElement payload)
    {
        var id = payload.GetProperty("id").GetString()!;
        var test = _store.GetPatientTest(id);
        if (test is not null) _store.UpsertPatientTest(test with { Status = "pending", Result = null, ResultValue = null, IsAbnormal = false, Waiting = false, ResultItemsJson = null });
    }

    private void ApplyVisitResult(string visitId, JsonElement payload, JsonElement result)
    {
        // The bill we made on this PC now has its official number.
        if (result.TryGetProperty("invoice_number", out var number) && number.GetString() is { Length: > 0 } official)
        {
            if (_store.GetInvoice(visitId) is { } bill && bill.InvoiceNumber != official) _store.AddAlias(bill.InvoiceNumber, "invoice", visitId);
            _store.SetInvoiceNumber(visitId, official);
        }

        if (!payload.TryGetProperty("patient", out var patient) || !patient.TryGetProperty("new", out var created)) return;

        var localId = created.GetProperty("id").GetString()!;
        var serverId = result.TryGetProperty("patient_uuid", out var u) ? u.GetString() : null;

        if (serverId is not null && serverId != localId)
        {
            // The server matched an existing patient by phone; drop our provisional copy. Labels already printed
            // with the provisional code must now find the real patient.
            if (_store.GetPatient(localId) is { } provisional) _store.AddAlias(provisional.PatientCode, "patient", serverId);
            _store.DeletePatient(localId);
        }
        else if (result.TryGetProperty("patient_code", out var code) && code.GetString() is { } patientCode)
        {
            var row = _store.GetPatient(localId);
            if (row is not null)
            {
                if (row.PatientCode != patientCode) _store.AddAlias(row.PatientCode, "patient", localId);
                _store.UpsertPatient(row with { PatientCode = patientCode, Pending = false });
            }
        }
    }

    private static string? Str(JsonElement row, string name) => Opt(row, name);

    private static string? Opt(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static bool Flag(JsonElement row, string name, bool whenMissing) =>
        row.TryGetProperty(name, out var v) ? v.ValueKind switch { JsonValueKind.True => true, JsonValueKind.False => false, _ => whenMissing } : whenMissing;

    private static decimal? NumOrNull(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;

    private static decimal Num(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;
}

public sealed class SyncException(ApiResult result) : Exception(result.ErrorMessage ?? $"HTTP {result.Status}")
{
    public ApiResult Result { get; } = result;
}
