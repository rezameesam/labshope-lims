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

/// <summary>A test ordered for a patient (a row on the lab's worklist), with its result once entered.</summary>
public sealed record PatientTest(
    string Id, string PatientId, string TestName, string TestDate, string Status,
    string? Result = null, decimal? ResultValue = null, string? ResultUnit = null,
    string? NormalRangeText = null, bool IsAbnormal = false, bool Waiting = false, string? ResultItemsJson = null);

/// <summary>A worklist line as the bench sees it: the test with who it is for.</summary>
public sealed record WorklistRow(PatientTest Test, string PatientName, string PatientCode)
{
    public string Id => Test.Id;
    public string TestName => Test.TestName;
    public string Status => Test.Status;
    public string Date => Test.TestDate;
    public string ResultText => Test.ResultItemsJson is { Length: > 2 } json ? $"{LabShope.Core.Visits.ResultItem.ParseAll(json).Count(i => i.Value.Trim() != "")} values"
        : Test.ResultValue is { } v ? $"{v:0.##} {Test.ResultUnit}".Trim() : Test.Result ?? "";
    public string Flag => Test.Status != "completed" ? "" : Test.IsAbnormal ? "ABNORMAL" : "normal";
    public string SyncText => Test.Waiting ? "waiting" : "";
    /// <summary>The one-word badge shown in the table: pending, normal or abnormal.</summary>
    public string Badge => Test.Status != "completed" ? "pending" : Test.IsAbnormal ? "abnormal" : "normal";
}

/// <summary>The numbers on the home screen.</summary>
public sealed record DashboardNumbers(int VisitsToday, int TestsToDo, decimal TakingsToday, decimal UnpaidBalance, int UnpaidBills, int NeedAttention, int Waiting);

public sealed record DayAmount(string Day, decimal Amount);
public sealed record MethodAmount(string Method, decimal Amount, int Count);
public sealed record TestCount(string TestName, int Count);

/// <summary>A period summary for the Reports screen, worked out entirely from this PC's data.</summary>
public sealed record ReportSummary(
    int Visits, decimal Billed, decimal Collected, decimal Outstanding, int TestsOrdered, int TestsCompleted,
    IReadOnlyList<DayAmount> DailyCollections, IReadOnlyList<MethodAmount> ByMethod, IReadOnlyList<TestCount> TopTests);

/// <summary>A booking made by a patient on the website (new, contacted, scheduled, converted, closed).</summary>
public sealed record BookingRequest(
    string Id, string FullName, string Phone, string? Email, string BookingType, string? PreferredDate,
    string? TestDetails, string? Notes, string Status, string? PatientId, string CreatedAt, bool Waiting = false)
{
    public string Created => DateTimeOffset.TryParse(CreatedAt, out var d) ? d.ToLocalTime().ToString("dd MMM HH:mm") : CreatedAt;
    public string Type => BookingType.Replace('_', ' ');
}
