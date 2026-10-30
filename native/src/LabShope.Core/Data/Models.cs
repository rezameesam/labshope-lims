namespace LabShope.Core.Data;

public sealed record Patient(
    string Id,
    string PatientCode,
    string FullName,
    string Phone,
    string? Gender,
    string? DateOfBirth,
    bool Pending = false,
    string? Email = null)
{
    /// <summary>The date of birth as people read it (day first).</summary>
    public string BirthDate => Dates.FromIso(DateOfBirth);
}

/// <summary>
/// A bill. <see cref="TotalAmount"/> is what the patient has to pay (the website's final_amount, after any discount);
/// <see cref="Discount"/> is how much was taken off the full price.
/// </summary>
public sealed record Invoice(
    string Id,
    string InvoiceNumber,
    string PatientId,
    decimal TotalAmount,
    decimal PaidAmount,
    string? PaymentStatus,
    string CreatedAt,
    decimal Discount = 0m);

public abstract record ScanMatch
{
    public sealed record FoundPatient(Patient Patient) : ScanMatch;
    public sealed record FoundInvoice(Invoice Invoice, Patient? Patient) : ScanMatch;
    public sealed record NotFound(string Code) : ScanMatch;
}

/// <summary>A bill as the counter sees it: who it is for and what is still owed.</summary>
public sealed record BillRow(
    string Id, string InvoiceNumber, string PatientId, string PatientName, string PatientCode,
    decimal TotalAmount, decimal PaidAmount, string PaymentStatus, string CreatedAt, decimal Discount = 0m)
{
    public decimal Balance => Math.Max(TotalAmount - PaidAmount, 0);
    public bool Provisional => InvoiceNumber.StartsWith("L-");
    public string Number => Provisional ? InvoiceNumber + " (provisional)" : InvoiceNumber;
    public string Date => Dates.FromMoment(CreatedAt);
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
    string? NormalRangeText = null, bool IsAbnormal = false, bool Waiting = false, string? ResultItemsJson = null,
    string? ExternalLabId = null, decimal? OutsourceCost = null);

/// <summary>A worklist line as the bench sees it: the test with who it is for.</summary>
public sealed record WorklistRow(PatientTest Test, string PatientName, string PatientCode, string? OutsourcedTo = null)
{
    public string TestLabel => OutsourcedTo is null ? Test.TestName : $"{Test.TestName}  →  {OutsourcedTo}";
    public string Id => Test.Id;
    public string PatientLabel => $"{PatientName}  ·  {PatientCode}";
    public string TestName => Test.TestName;
    public string Status => Test.Status;
    public string Date => Test.TestDate;
    public string ResultText => Test.ResultItemsJson is { Length: > 2 } json ? $"{LabShope.Core.Visits.ResultItem.ParseAll(json).Count(i => i.Value.Trim() != "")} values"
        : Test.ResultValue is { } v ? $"{ResultFormat.Number(v)} {Test.ResultUnit}".Trim() : Test.Result ?? "";
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
    public string Created => Dates.FromMoment(CreatedAt);
    public string Type => BookingType.Replace('_', ' ');
}

/// <summary>One thing waiting to be sent to the server (or refused by it), described in words a person can read.</summary>
public sealed record OutboxEntry(string Id, string Kind, string Status, int Attempts, string? LastError, string Who, string UpdatedAt)
{
    public string What => Kind switch
    {
        "visit" => "Visit registration",
        "payment" => "Payment",
        "result" => "Test result",
        "patient" => "Patient change",
        "booking" => "Booking update",
        "outsource" => "Sent to external lab",
        _ => Kind,
    };
    public string Badge => Status == "failed" ? "failed" : "waiting";
    /// <summary>Why it was refused, or (for items that are only waiting) that they will go when the connection is back.</summary>
    public string Detail => Status == "failed" ? LastError ?? "The server refused it." : "Will be sent when the connection is available.";
    public string Updated => long.TryParse(UpdatedAt, out var ms) ? Dates.DateTime(DateTimeOffset.FromUnixTimeMilliseconds(ms)) : UpdatedAt;
}

/// <summary>A result received from a lab machine, waiting for a person to check it (or already accepted/discarded).</summary>
public sealed record InstrumentEntry(
    string Id, string ReceivedAt, string Protocol, string SampleId, string? MachinePatientName,
    string? PatientId, string ParametersJson, string Status, string? Note)
{
    public string Received => Dates.FromMoment(ReceivedAt);
    public int ParameterCount => LabShope.Core.Visits.InstrumentInbox.ParseParameters(ParametersJson).Count;
}

/// <summary>Shows a result number as it was entered (up to 6 decimals, never rounded to 2: TSH 0.004 must not print as 0).</summary>
public static class ResultFormat
{
    public static string Number(decimal value) => value.ToString("0.######", System.Globalization.CultureInfo.InvariantCulture);
}
