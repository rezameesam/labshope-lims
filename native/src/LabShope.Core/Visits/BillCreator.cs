using System.Globalization;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record BillTestLine(string TestId, string TestName, decimal Price);

/// <summary>A test that is already on a bill.</summary>
public sealed record AlreadyBilled(string TestName, string InvoiceNumber, string Status)
{
    public bool Paid => Status == "paid";
}

public sealed record CreateBillResult(bool Ok, string? Error, Invoice? Invoice = null, IReadOnlyList<AlreadyBilled>? NeedsConfirmation = null);

/// <summary>
/// The website's "Create invoice" for tests a patient already has: pick the tests, adjust prices, give a discount, and a bill is made with the
/// next invoice number. A test already on a paid bill cannot be billed again; one on an unpaid bill can, after a confirmation (it makes a second bill).
/// Needs the internet, because the invoice number comes from the server.
/// </summary>
public static class BillCreator
{
    /// <summary>Which of these tests are already on a bill, with that bill's number and payment status (keyed by test id).</summary>
    public static async Task<(IReadOnlyDictionary<string, AlreadyBilled> Billed, string? Error)> BilledTestsAsync(SupabaseApi api, string organizationId, IEnumerable<PatientTest> tests, CancellationToken ct = default)
    {
        var byId = tests.GroupBy(t => t.Id).ToDictionary(g => g.Key, g => g.First());
        var result = new Dictionary<string, AlreadyBilled>();
        if (byId.Count == 0) return (result, null);

        var items = await api.SelectAsync("invoice_items", $"select=patient_test_id,invoice_id&organization_id=eq.{organizationId}&patient_test_id=in.({string.Join(",", byId.Keys)})", ct);
        if (items.NetworkFailure) return (result, "Billing needs an internet connection.");
        if (!items.Ok) return (result, items.ErrorMessage ?? "Could not check which tests are already billed.");
        var links = items.Body is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray().ToList() : [];
        if (links.Count == 0) return (result, null);

        var invoiceIds = links.Select(l => l.GetProperty("invoice_id").GetString()!).Distinct().ToList();
        var invoices = await api.SelectAsync("invoices", $"select=id,invoice_number,payment_status&organization_id=eq.{organizationId}&id=in.({string.Join(",", invoiceIds)})", ct);
        if (!invoices.Ok) return (result, invoices.NetworkFailure ? "Billing needs an internet connection." : invoices.ErrorMessage ?? "Could not check the bills.");
        static string? S(JsonElement e, string n) => e.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var byInvoice = (invoices.Body is { ValueKind: JsonValueKind.Array } b ? b.EnumerateArray() : Enumerable.Empty<JsonElement>())
            .Where(i => S(i, "payment_status") != "cancelled")
            .ToDictionary(i => S(i, "id")!, i => (Number: S(i, "invoice_number") ?? "", Status: S(i, "payment_status") ?? "pending"));

        foreach (var link in links)
        {
            var testId = link.GetProperty("patient_test_id").GetString()!;
            var invoiceId = link.GetProperty("invoice_id").GetString()!;
            if (!byInvoice.TryGetValue(invoiceId, out var invoice) || !byId.TryGetValue(testId, out var test)) continue;
            // If a test is on several bills, the paid one wins (it blocks billing again).
            if (!result.TryGetValue(testId, out var existing) || (!existing.Paid && invoice.Status == "paid"))
                result[testId] = new AlreadyBilled(test.TestName, invoice.Number, invoice.Status);
        }
        return (result, null);
    }

    public static async Task<CreateBillResult> CreateAsync(SupabaseApi api, string organizationId, string? userId, string? labId, string patientId,
        IReadOnlyList<BillTestLine> lines, string discountText, string? notes, IReadOnlyList<PatientTest> tests, bool confirmedDuplicates = false,
        Func<DateTimeOffset>? now = null, Func<Guid>? newId = null, CancellationToken ct = default)
    {
        if (lines.Count == 0) return new(false, "Pick at least one test to bill.");
        if (lines.Any(l => l.Price < 0)) return new(false, "Enter every price as a number (0 or more).");
        discountText = (discountText ?? "").Trim();
        decimal typedDiscount = 0;
        if (discountText.Length > 0 && !decimal.TryParse(discountText, NumberStyles.Number, CultureInfo.CurrentCulture, out typedDiscount))
            return new(false, "Enter the discount as a number (0 for none).");

        var (billed, checkError) = await BilledTestsAsync(api, organizationId, tests.Where(t => lines.Any(l => l.TestId == t.Id)), ct);
        if (checkError is not null) return new(false, checkError);
        var paid = lines.Where(l => billed.TryGetValue(l.TestId, out var b) && b.Paid).Select(l => billed[l.TestId]).ToList();
        if (paid.Count > 0)
            return new(false, $"Cannot bill again: {string.Join(", ", paid.Select(p => p.TestName))} {(paid.Count == 1 ? "is" : "are")} already on a paid bill ({string.Join(", ", paid.Select(p => p.InvoiceNumber).Distinct())}).");
        var unpaid = lines.Where(l => billed.ContainsKey(l.TestId)).Select(l => billed[l.TestId]).ToList();
        if (unpaid.Count > 0 && !confirmedDuplicates)
            return new(false, $"{string.Join(", ", unpaid.Select(u => u.TestName))} {(unpaid.Count == 1 ? "is" : "are")} already on an unpaid bill. Billing again makes a second bill.", NeedsConfirmation: unpaid);

        var total = PatientRules.Paise(lines.Sum(l => l.Price));
        var discount = Math.Min(Math.Max(PatientRules.Paise(typedDiscount), 0m), total);
        var final = total - discount;

        var number = await api.RpcAsync("generate_invoice_number", new { p_organization_id = organizationId }, ct);
        if (number.NetworkFailure) return new(false, "Billing needs an internet connection.");
        if (!number.Ok || number.Body is not { ValueKind: JsonValueKind.String } numberText || string.IsNullOrWhiteSpace(numberText.GetString()))
            return new(false, number.Status is 401 or 403 ? "Your account isn't allowed to create bills." : number.ErrorMessage ?? "Could not get the next invoice number.");

        var id = (newId?.Invoke() ?? Guid.NewGuid()).ToString();
        var created = (now?.Invoke() ?? DateTimeOffset.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        // The discount goes in the first insert: the accounts post revenue from the final amount at that moment.
        var invoice = await api.InsertAsync("invoices", new
        {
            id, invoice_number = numberText.GetString(), patient_id = patientId, organization_id = organizationId, lab_id = labId,
            total_amount = total, discount_amount = discount, discount_entered_by = discount > 0 ? userId : null, final_amount = final,
            notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(), created_by = userId,
        }, ct);
        if (!invoice.Ok)
            return new(false, invoice.NetworkFailure ? "Billing needs an internet connection." : invoice.Status is 401 or 403 ? "Your account isn't allowed to create bills." : invoice.ErrorMessage ?? "The bill was not created.");

        var items = await api.InsertAsync("invoice_items", lines.Select(l => new
        {
            invoice_id = id, organization_id = organizationId, patient_test_id = l.TestId, test_name = l.TestName, unit_price = l.Price, amount = l.Price,
        }).ToList(), ct);
        if (!items.Ok)
        {
            await api.DeleteAsync("invoices", $"id=eq.{id}&organization_id=eq.{organizationId}", ct); // never leave a bill with no items
            return new(false, items.NetworkFailure ? "The connection dropped while billing. Nothing was saved; try again." : items.ErrorMessage ?? "The bill's items were not saved, so the bill was not created.");
        }

        return new(true, null, new Invoice(id, numberText.GetString()!, patientId, final, 0m, "pending", created, discount));
    }
}
