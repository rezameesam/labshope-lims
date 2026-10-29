using System.Text.Json.Nodes;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record PaymentInput(string InvoiceId, decimal Amount, string Method = "cash", string? TransactionId = null, string? Notes = null);

/// <summary>What the cashier hands the patient. Provisional until the server gives the bill its official number.</summary>
public sealed record Receipt(
    string PaymentId, string InvoiceNumber, bool Provisional, string PatientName,
    decimal Total, decimal Amount, decimal Paid, decimal Balance, string Status, string Method, string PaidAt, decimal Discount = 0m);

/// <summary>
/// Takes a payment against a bill on this PC first (the bill shows it paid at once), and queues it for the
/// server. On the server it posts to the accounts automatically (Dr Cash / Cr Receivable), the same as a
/// payment taken on the website.
/// </summary>
public sealed class PaymentService
{
    public static readonly string[] Methods = ["cash", "upi", "card", "online", "bank_transfer"];

    private readonly LocalStore _store;
    private readonly string _organizationId;
    private readonly Func<DateTimeOffset> _now;

    public PaymentService(LocalStore store, string organizationId, Func<DateTimeOffset>? now = null)
    {
        _store = store;
        _organizationId = organizationId;
        _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    public Receipt Record(PaymentInput input)
    {
        var bill = _store.GetInvoice(input.InvoiceId) ?? throw new ArgumentException("That bill isn't on this computer.");
        input = input with { Amount = PatientRules.Paise(input.Amount) }; // no fractions of a paisa
        if (input.Amount <= 0) throw new ArgumentException("Enter an amount greater than zero.");
        if (!Methods.Contains(input.Method)) throw new ArgumentException($"Unknown payment method: {input.Method}.");

        var balance = bill.TotalAmount - bill.PaidAmount;
        if (input.Amount > balance) throw new ArgumentException($"That is more than the balance due ({balance:0.##}).");

        var paymentId = Guid.NewGuid().ToString();
        var paidAt = _now().UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"); // one fixed UTC form so days can be compared as text
        var paid = bill.PaidAmount + input.Amount;

        _store.InTransaction(() =>
        {
            _store.AddPayment(new LocalPayment(paymentId, bill.Id, input.Amount, input.Method, input.TransactionId, input.Notes, paidAt, Synced: false));
            _store.SetInvoicePaid(bill.Id, paid);

            var payload = new JsonObject
            {
                ["payment_id"] = paymentId, ["invoice_id"] = bill.Id, ["organization_id"] = _organizationId,
                ["amount"] = input.Amount, ["payment_method"] = input.Method,
                ["transaction_id"] = input.TransactionId, ["notes"] = input.Notes, ["payment_date"] = paidAt,
            };
            var patient = _store.GetPatient(bill.PatientId);
            _store.EnqueueVisit(new OutboxItem(paymentId, payload.ToJsonString(), "pending", 0, null, patient?.FullName ?? "", input.Amount, Kind: "payment"));
        });

        return ReceiptFor(paymentId, bill.Id)!;
    }

    /// <summary>Rebuilds a receipt (for reprinting) from what is stored.</summary>
    public Receipt? ReceiptFor(string paymentId, string invoiceId)
    {
        var bill = _store.GetInvoice(invoiceId);
        var payment = _store.PaymentsFor(invoiceId).FirstOrDefault(p => p.Id == paymentId);
        if (bill is null || payment is null) return null;

        var patient = _store.GetPatient(bill.PatientId);
        return new Receipt(payment.Id, bill.InvoiceNumber, IsProvisional(bill.InvoiceNumber), patient?.FullName ?? "",
            bill.TotalAmount, payment.Amount, bill.PaidAmount, Math.Max(bill.TotalAmount - bill.PaidAmount, 0),
            bill.PaymentStatus ?? "pending", payment.Method, payment.PaidAt, bill.Discount);
    }

    public static bool IsProvisional(string invoiceNumber) => invoiceNumber.StartsWith("L-");
}
