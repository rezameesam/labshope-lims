using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>A test the patient already had lately. Risk follows the website's "duplicate intelligence": within 7 days high, within 30 medium.</summary>
public sealed record RepeatWarning(string TestName, string LastDate, int DaysAgo, string LastStatus)
{
    public string Risk => DaysAgo <= 7 ? "high" : "medium";
    public string Text => DaysAgo == 0 ? $"{TestName} was already ordered today ({LastStatus.Replace('_', ' ')})"
        : $"{TestName} was ordered {DaysAgo} day(s) ago on {Dates.FromIso(LastDate)} ({LastStatus.Replace('_', ' ')})";
}

public static class RepeatTests
{
    public const int WindowDays = 30;

    /// <summary>The chosen tests this patient already had in the last 30 days (the latest order of each), most recent first.</summary>
    public static IReadOnlyList<RepeatWarning> Find(LocalStore store, string patientId, IEnumerable<string> chosen, DateOnly today)
    {
        var names = chosen.Select(n => n.Trim().ToLowerInvariant()).ToHashSet();
        if (names.Count == 0) return [];
        var latest = new Dictionary<string, (string Name, DateOnly Date, string Raw, string Status)>();
        foreach (var t in store.TestsOfPatient(patientId))
        {
            var key = t.TestName.Trim().ToLowerInvariant();
            if (!names.Contains(key) || !DateOnly.TryParseExact(t.TestDate.Length >= 10 ? t.TestDate[..10] : t.TestDate, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var date)) continue;
            var days = today.DayNumber - date.DayNumber;
            if (days < 0 || days > WindowDays) continue;
            if (!latest.TryGetValue(key, out var prev) || date > prev.Date) latest[key] = (t.TestName, date, t.TestDate, t.Status);
        }
        return latest.Values.OrderByDescending(v => v.Date)
            .Select(v => new RepeatWarning(v.Name, v.Raw, today.DayNumber - v.Date.DayNumber, v.Status)).ToList();
    }
}
