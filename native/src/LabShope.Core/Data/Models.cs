namespace LabShope.Core.Data;

public sealed record Patient(
    string Id,
    string PatientCode,
    string FullName,
    string Phone,
    string? Gender,
    string? DateOfBirth,
    bool Pending = false);

public sealed record Invoice(
    string Id,
    string InvoiceNumber,
    string PatientId,
    decimal TotalAmount,
    decimal PaidAmount,
    string? PaymentStatus,
    string CreatedAt);

public abstract record ScanMatch
{
    public sealed record FoundPatient(Patient Patient) : ScanMatch;
    public sealed record FoundInvoice(Invoice Invoice, Patient? Patient) : ScanMatch;
    public sealed record NotFound(string Code) : ScanMatch;
}

/// <summary>A bill as the counter sees it: who it is for and what is still owed.</summary>
public sealed record BillRow(
    string Id, string InvoiceNumber, string PatientId, string PatientName, string PatientCode,
    decimal TotalAmount, decimal PaidAmount, string PaymentStatus, string CreatedAt)
{
    public decimal Balance => Math.Max(TotalAmount - PaidAmount, 0);
    public bool Provisional => InvoiceNumber.StartsWith("L-");
    public string Number => Provisional ? InvoiceNumber + " (provisional)" : InvoiceNumber;
    public string Date => DateTimeOffset.TryParse(CreatedAt, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy HH:mm") : CreatedAt;
}

/// <summary>One payment line in the cash book.</summary>
public sealed record PaymentRow(string Id, string PaidAt, string InvoiceNumber, string PatientName, string Method, decimal Amount, bool Synced)
{
    public string Time => DateTimeOffset.TryParse(PaidAt, out var d) ? d.ToLocalTime().ToString("HH:mm") : PaidAt;
    public string SyncText => Synced ? "sent" : "waiting";
}
