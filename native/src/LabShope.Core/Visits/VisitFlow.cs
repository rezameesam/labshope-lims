using System.Globalization;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public enum VisitStage { Waiting, Testing, Ready, Done }

/// <summary>One patient's visit on one day: their tests, how far along they are, and what is still owed.</summary>
public sealed record FlowVisit(
    string PatientId, string PatientName, string PatientCode, string Phone, string Date,
    IReadOnlyList<PatientTest> Tests, VisitStage Stage, decimal Billed, decimal Paid, string? BillId)
{
    public decimal Due => Math.Max(Billed - Paid, 0m);
    public int Finished => Tests.Count(t => t.Status == "completed");
    public string Key => $"{PatientId}|{Date}";

    public string StageText => Stage switch
    {
        VisitStage.Waiting => "Waiting",
        VisitStage.Testing => "Testing",
        VisitStage.Ready => "Ready",
        _ => "Done",
    };

    /// <summary>What the person at the desk should do next for this visit.</summary>
    public string NextStep => Stage switch
    {
        VisitStage.Waiting => "Start testing",
        VisitStage.Testing => "Enter results",
        VisitStage.Ready when Due > 0 => "Take payment, then give the report",
        VisitStage.Ready => "Give the report",
        _ => "Nothing left to do",
    };

    public string TestsSummary
    {
        get
        {
            var names = Tests.Select(t => t.TestName).ToList();
            return names.Count <= 3 ? string.Join(", ", names) : string.Join(", ", names.Take(2)) + $" +{names.Count - 2} more";
        }
    }

    public string Progress => $"{Finished}/{Tests.Count} done";
    public string BillText => Billed <= 0 ? "no bill" : Due <= 0 ? "paid" : $"₹{Due:0.##} due";
}

/// <summary>
/// Turns the tests and bills kept on this PC into the front-desk board: each patient visit with a stage, so staff see at a glance who is waiting,
/// whose tests are being run, whose results are ready to hand over and who still has to pay. Nothing here is stored: it is worked out from the
/// same tests and bills every other screen uses, so it is always in step with them and works offline.
/// </summary>
public static class VisitFlow
{
    public static IReadOnlyList<FlowVisit> Build(LocalStore store, DateOnly from, DateOnly to)
    {
        var f = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var t = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var tests = store.FlowTests(f, t);
        if (tests.Count == 0) return [];

        // Bills are matched to a visit by patient and day. Look back a little before the earliest test, because a bill is stamped in UTC.
        var earliest = DateOnly.TryParseExact(tests.Min(x => x.TestDate), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var e) ? e : from;
        var bills = store.SearchBills("", limit: 5000, fromIso: earliest.AddDays(-1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "T00:00:00")
            .Where(b => b.PaymentStatus != "cancelled").ToList();

        var visits = new List<FlowVisit>();
        foreach (var group in tests.GroupBy(x => (x.PatientId, x.TestDate)))
        {
            var patient = store.GetPatient(group.Key.PatientId);
            var list = group.ToList();
            var own = bills.Where(b => b.PatientId == group.Key.PatientId && LocalDay(b.CreatedAt) == group.Key.TestDate).ToList();
            var billed = own.Sum(b => b.TotalAmount);
            var paid = own.Sum(b => b.PaidAmount);
            var unpaid = own.Where(b => b.Balance > 0).OrderBy(b => b.CreatedAt).FirstOrDefault() ?? own.FirstOrDefault();
            visits.Add(new FlowVisit(group.Key.PatientId, patient?.FullName ?? "(unknown patient)", patient?.PatientCode ?? "", patient?.Phone ?? "",
                group.Key.TestDate, list, StageOf(list, Math.Max(billed - paid, 0m)), billed, paid, unpaid?.Id));
        }

        return visits.OrderBy(v => (int)v.Stage).ThenBy(v => v.Date, StringComparer.Ordinal).ThenBy(v => v.PatientName, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    public static VisitStage StageOf(IReadOnlyList<PatientTest> tests, decimal due)
    {
        if (tests.All(t => t.Status == "completed")) return due > 0 ? VisitStage.Ready : VisitStage.Done;
        // Under way: a test was started, some are finished already, or one is out at an external lab.
        var underWay = tests.Any(t => t.Status == "in_progress" || t.Status == "completed" || !string.IsNullOrEmpty(t.ExternalLabId));
        return underWay ? VisitStage.Testing : VisitStage.Waiting;
    }

    private static string LocalDay(string createdAt) =>
        DateTimeOffset.TryParse(createdAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var moment)
            ? moment.ToLocalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : createdAt.Length >= 10 ? createdAt[..10] : createdAt;
}
