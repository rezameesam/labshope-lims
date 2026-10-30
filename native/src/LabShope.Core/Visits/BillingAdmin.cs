using System.Globalization;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record BillItem(string Id, string TestName, decimal UnitPrice, decimal Quantity, decimal Amount);
public sealed record BillPayment(string Id, decimal Amount, string Method, string PaidAt, string? TransactionId, string? Notes, string? ReceivedBy)
{
    public string When => Dates.FromMoment(PaidAt);
    public string MethodText => Method.Replace('_', ' ');
}
public sealed record BillHistoryEntry(string ChangedAt, string? ChangedBy, string Action, string Summary)
{
    public string When => Dates.FromMoment(ChangedAt);
    public string What => Action.Replace('_', ' ');
}
public sealed record BillDetails(IReadOnlyList<BillItem> Items, IReadOnlyList<BillPayment> Payments, IReadOnlyList<BillHistoryEntry> History, string? Error, bool Offline);

/// <summary>
/// What the website's Billing screen shows for one bill (items, payments with who took them, the change history) and the edit it allows
/// (item prices and the discount). Done online, straight against the server, because the books and the audit trail are kept there.
/// </summary>
public static class BillingAdmin
{
    public static async Task<BillDetails> LoadAsync(SupabaseApi api, string organizationId, string invoiceId, CancellationToken ct = default)
    {
        var items = await api.SelectAsync("invoice_items", $"select=id,test_name,unit_price,quantity,amount&invoice_id=eq.{invoiceId}&organization_id=eq.{organizationId}", ct);
        if (!items.Ok) return Failed(items);
        var payments = await api.SelectAsync("payments", $"select=id,amount,payment_method,payment_date,transaction_id,notes,received_by&invoice_id=eq.{invoiceId}&organization_id=eq.{organizationId}&order=payment_date.desc", ct);
        if (!payments.Ok) return Failed(payments);
        var audit = await api.SelectAsync("billing_audit", $"select=changed_at,changed_by,action,old_values,new_values&invoice_id=eq.{invoiceId}&organization_id=eq.{organizationId}&order=changed_at.desc", ct);
        if (!audit.Ok) return Failed(audit);

        static string? S(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        static decimal N(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;
        IEnumerable<JsonElement> Rows(ApiResult r) => r.Body is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray() : [];

        var staffIds = Rows(payments).Select(p => S(p, "received_by")).Concat(Rows(audit).Select(a => S(a, "changed_by"))).Where(i => i is not null).Distinct().ToList();
        var names = await StaffNamesAsync(api, organizationId, staffIds!, ct);
        string? Name(string? id) => id is null ? null : names.GetValueOrDefault(id, "Unknown staff");

        return new BillDetails(
            Rows(items).Select(i => new BillItem(S(i, "id")!, S(i, "test_name") ?? "", N(i, "unit_price"), N(i, "quantity"), N(i, "amount"))).ToList(),
            Rows(payments).Select(p => new BillPayment(S(p, "id")!, N(p, "amount"), S(p, "payment_method") ?? "", S(p, "payment_date") ?? "", S(p, "transaction_id"), S(p, "notes"), Name(S(p, "received_by")))).ToList(),
            Rows(audit).Select(a => new BillHistoryEntry(S(a, "changed_at") ?? "", Name(S(a, "changed_by")), S(a, "action") ?? "",
                Describe(S(a, "action") ?? "", a.TryGetProperty("old_values", out var o) ? o : default, a.TryGetProperty("new_values", out var n) ? n : default))).ToList(),
            null, false);
    }

    private static BillDetails Failed(ApiResult r) => new([], [], [],
        r.NetworkFailure ? "The bill's details need an internet connection." : r.Status is 401 or 403 ? "Your account isn't allowed to see these details." : r.ErrorMessage ?? "Could not load the details.", r.NetworkFailure);

    private static async Task<Dictionary<string, string>> StaffNamesAsync(SupabaseApi api, string organizationId, IReadOnlyList<string> userIds, CancellationToken ct)
    {
        var map = new Dictionary<string, string>();
        if (userIds.Count == 0) return map;
        var res = await api.SelectAsync("employees", $"select=user_id,full_name&organization_id=eq.{organizationId}&user_id=in.({string.Join(",", userIds)})", ct);
        if (res.Body is { ValueKind: JsonValueKind.Array } rows)
            foreach (var r in rows.EnumerateArray())
                if (r.TryGetProperty("user_id", out var u) && u.GetString() is { } id && r.TryGetProperty("full_name", out var f) && f.GetString() is { } name) map[id] = name;
        return map;
    }

    /// <summary>The same one-line summaries the website shows in a bill's history.</summary>
    public static string Describe(string action, JsonElement oldValues, JsonElement newValues)
    {
        static decimal V(JsonElement e, string n) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var v)
            ? v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : decimal.TryParse(v.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0m : 0m;
        static string M(decimal v) => v.ToString("0.##", CultureInfo.InvariantCulture);
        var method = newValues.ValueKind == JsonValueKind.Object && newValues.TryGetProperty("payment_method", out var pm) ? pm.GetString() ?? "" : "";
        return action switch
        {
            "payment_recorded" => $"{M(V(newValues, "amount"))} via {method.Replace('_', ' ')}",
            "payment_updated" => $"Payment changed from {M(V(oldValues, "amount"))} to {M(V(newValues, "amount"))}",
            "payment_deleted" => $"Deleted payment of {M(V(oldValues, "amount"))}",
            "discount_updated" => $"Discount changed from {M(V(oldValues, "discount_amount"))} to {M(V(newValues, "discount_amount"))}",
            "invoice_updated" => $"Final amount changed from {M(V(oldValues, "final_amount"))} to {M(V(newValues, "final_amount"))}",
            "invoice_created" => $"Invoice created for {M(V(newValues, "final_amount"))}",
            _ => "",
        };
    }

    public sealed record EditedItem(string Id, decimal UnitPrice, decimal Quantity);

    /// <summary>
    /// The website's invoice edit: new item prices (amount = price x quantity), the discount clamped to 0..subtotal, then the invoice's
    /// total, discount, who entered it, final amount, and the payment status worked out from what has been paid. Only an admin may edit a paid bill.
    /// </summary>
    public static async Task<AdminResult> EditAsync(SupabaseApi api, string organizationId, string? userId, bool isAdmin, Invoice bill, IReadOnlyList<EditedItem> items, decimal discount, CancellationToken ct = default)
    {
        if (!isAdmin && bill.PaymentStatus == "paid") return new(false, "Only administrators can edit paid invoices. Please ask an admin.");
        if (items.Count == 0) return new(false, "This bill has no items to edit.");
        if (items.Any(i => i.UnitPrice < 0)) return new(false, "A price can't be negative.");

        var lines = items.Select(i => (i.Id, Price: PatientRules.Paise(i.UnitPrice), Amount: PatientRules.Paise(i.UnitPrice * i.Quantity))).ToList();
        var subtotal = lines.Sum(l => l.Amount);
        var applied = Math.Min(Math.Max(PatientRules.Paise(discount), 0m), subtotal); // the website's clampDiscount: between 0 and the subtotal
        var final = subtotal - applied;
        var status = bill.PaidAmount >= final ? "paid" : bill.PaidAmount > 0 ? "partial" : "pending";

        foreach (var l in lines)
        {
            var res = await api.PatchAsync("invoice_items", $"id=eq.{l.Id}&organization_id=eq.{organizationId}", new { unit_price = l.Price, amount = l.Amount }, ct);
            if (res.NetworkFailure) return new(false, "Editing a bill needs an internet connection.");
            if (!res.Ok) return new(false, res.Status is 401 or 403 ? "Your account isn't allowed to edit bills." : res.ErrorMessage ?? "The item prices were not saved.");
        }

        var paidAt = status == "paid" ? DateTimeOffset.UtcNow.ToString("O") : null;
        var invoice = await api.PatchAsync("invoices", $"id=eq.{bill.Id}&organization_id=eq.{organizationId}", new
        {
            total_amount = subtotal, discount_amount = applied, discount_entered_by = applied > 0 ? userId : null,
            final_amount = final, updated_by = userId, payment_status = status, paid_at = paidAt,
        }, ct);
        if (invoice.NetworkFailure) return new(false, "Editing a bill needs an internet connection.");
        if (!invoice.Ok) return new(false, invoice.Status is 401 or 403 ? "Your account isn't allowed to edit bills." : invoice.ErrorMessage ?? "The bill was not saved.");
        if (invoice.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0) return new(false, "The server did not accept the change (bill not found, or your account isn't allowed to edit it).");
        return new(true, null);
    }
}
