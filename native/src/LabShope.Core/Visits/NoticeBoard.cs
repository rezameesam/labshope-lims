using System.Globalization;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record Notice(string Kind, string Priority, string Title, string Description, string Date, string PatientId)
{
    public string DateText => Dates.FromIso(Date);
    public string PriorityText => Priority switch { "high" => "High priority", "medium" => "Medium", _ => "Low" };
    /// <summary>The screen that deals with it.</summary>
    public string Action => Kind == "test" ? "Enter results" : "View bill";
}

public sealed record NoticeStats(int PendingTests, int OverdueTests, int PendingBills, int OverdueBills)
{
    public int Total => PendingTests + PendingBills;
}

/// <summary>
/// The website's Notice Board: what needs doing, most urgent first. Tests still waiting or being worked on (late after a day), and bills not yet paid
/// (late after 30 days). Worked out from the tests and bills on this PC, so it works offline.
/// </summary>
public static class NoticeBoard
{
    public static (IReadOnlyList<Notice> Notices, NoticeStats Stats) Build(LocalStore store, DateOnly today)
    {
        var notices = new List<Notice>();
        int pendingTests = 0, overdueTests = 0, pendingBills = 0, overdueBills = 0;

        foreach (var row in store.SearchWorklist("", ["pending", "in_progress"], 5000))
        {
            var days = DateOnly.TryParseExact(row.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? today.DayNumber - d.DayNumber : 0;
            var overdue = days > 1;
            pendingTests++;
            if (overdue) overdueTests++;
            notices.Add(new Notice("test", overdue ? "high" : days > 0 ? "medium" : "low", $"Test result pending: {row.TestName}",
                $"Patient: {row.PatientName} ({row.PatientCode})" + (overdue ? $"  ·  {days} days waiting" : ""), row.Date, row.Test.PatientId));
        }

        foreach (var bill in store.SearchBills("", onlyUnpaid: true, limit: 2000).Where(b => b.PaymentStatus != "cancelled" && b.Balance > 0))
        {
            var created = DateTimeOffset.TryParse(bill.CreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at) ? DateOnly.FromDateTime(at.LocalDateTime) : today;
            var overdue = today.DayNumber - created.DayNumber > 30;
            pendingBills++;
            if (overdue) overdueBills++;
            notices.Add(new Notice("bill", overdue ? "high" : "medium", $"Outstanding payment: ₹{bill.Balance:0.##}",
                $"Bill {bill.InvoiceNumber}  ·  Patient: {bill.PatientName}", created.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), bill.PatientId));
        }

        static int Rank(string p) => p switch { "high" => 0, "medium" => 1, _ => 2 };
        var ordered = notices.OrderBy(n => Rank(n.Priority)).ThenBy(n => n.Date, StringComparer.Ordinal).ToList();
        return (ordered, new NoticeStats(pendingTests, overdueTests, pendingBills, overdueBills));
    }
}
