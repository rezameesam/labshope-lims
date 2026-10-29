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
