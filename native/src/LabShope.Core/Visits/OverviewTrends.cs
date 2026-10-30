using System.Globalization;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record TrendDay(DateOnly Date, decimal Billed, decimal Collected, int Tests)
{
    public string Label => Date.ToString("dd MMM", CultureInfo.CurrentCulture);
}
public sealed record TopTest(string Name, int Count);
public sealed record Trends(IReadOnlyList<TrendDay> Days, IReadOnlyList<TopTest> TopTests)
{
    public decimal TotalBilled => Days.Sum(d => d.Billed);
    public decimal TotalCollected => Days.Sum(d => d.Collected);
    public int TotalTests => Days.Sum(d => d.Tests);
}

/// <summary>The Overview's charts: money billed and collected and tests ordered per day over the last days, plus the most-ordered tests. All from this PC.</summary>
public static class OverviewTrends
{
    public static Trends Build(LocalStore store, DateOnly today, int days = 14, int topCount = 5)
    {
        var first = today.AddDays(-(days - 1));
        var startLocal = first.ToDateTime(TimeOnly.MinValue);
        var fromUtc = new DateTimeOffset(startLocal, TimeZoneInfo.Local.GetUtcOffset(startLocal)).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
        var toUtc = DateTime.UtcNow.AddDays(2).ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);

        static DateOnly? Day(string iso) => DateTimeOffset.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d) ? DateOnly.FromDateTime(d.ToLocalTime().DateTime) : null;

        var billed = store.SearchBills("", false, 20000, null, fromUtc, toUtc)
            .Select(b => (Day: Day(b.CreatedAt), b.TotalAmount)).Where(x => x.Day is not null).GroupBy(x => x.Day!.Value).ToDictionary(g => g.Key, g => g.Sum(x => x.TotalAmount));
        var collected = store.PaymentsBetween(fromUtc, toUtc)
            .Select(p => (Day: Day(p.PaidAt), p.Amount)).Where(x => x.Day is not null).GroupBy(x => x.Day!.Value).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
        var firstText = first.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var todayText = today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var tests = store.FlowTests(firstText, todayText, 50000).Where(t => string.CompareOrdinal(t.TestDate, firstText) >= 0 && string.CompareOrdinal(t.TestDate, todayText) <= 0).ToList();
        var testsByDay = tests.GroupBy(t => t.TestDate).ToDictionary(g => g.Key, g => g.Count());

        var list = Enumerable.Range(0, days).Select(i => first.AddDays(i))
            .Select(d => new TrendDay(d, billed.GetValueOrDefault(d), collected.GetValueOrDefault(d), testsByDay.GetValueOrDefault(d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)))).ToList();
        var top = tests.GroupBy(t => t.TestName).Select(g => new TopTest(g.Key, g.Count())).OrderByDescending(t => t.Count).ThenBy(t => t.Name).Take(topCount).ToList();
        return new Trends(list, top);
    }
}
