using System.Globalization;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public sealed class OverviewTrendsTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-trend-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Now);

    public OverviewTrendsTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "PAT1", "Asha Rao", "+919876543210", null, null));
    }

    public void Dispose() { _store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) try { File.Delete(f); } catch { } }

    /// <summary>Local noon of that day, as the UTC text the store keeps.</summary>
    private static string Noon(DateOnly d)
    {
        var local = d.ToDateTime(new TimeOnly(12, 0));
        return new DateTimeOffset(local, TimeZoneInfo.Local.GetUtcOffset(local)).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
    }

    [Fact]
    public void SumsBilledCollectedAndTestsPerDayAndRanksTheTopTests()
    {
        var yesterday = Today.AddDays(-1);
        _store.UpsertInvoice(new Invoice("i1", "INV-1", "p1", 500m, 200m, "partial", Noon(Today)));
        _store.UpsertInvoice(new Invoice("i2", "INV-2", "p1", 300m, 300m, "paid", Noon(Today)));
        _store.UpsertInvoice(new Invoice("i3", "INV-3", "p1", 100m, 0m, "pending", Noon(yesterday)));
        _store.UpsertInvoice(new Invoice("old", "INV-0", "p1", 900m, 900m, "paid", Noon(Today.AddDays(-40)))); // outside the window
        _store.AddPayment(new LocalPayment("pay1", "i1", 200m, "cash", null, null, Noon(Today), true));
        _store.AddPayment(new LocalPayment("pay2", "i2", 300m, "upi", null, null, Noon(yesterday), true));
        foreach (var (id, name, day) in new[] { ("t1", "CBC", Today), ("t2", "CBC", Today), ("t3", "LFT", yesterday), ("t4", "TSH", Today.AddDays(-30)) })
            _store.UpsertPatientTest(new PatientTest(id, "p1", name, day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), "completed"));

        var trends = OverviewTrends.Build(_store, Today);

        Assert.Equal(14, trends.Days.Count);
        Assert.Equal(Today, trends.Days[^1].Date);
        Assert.Equal((800m, 200m, 2), (trends.Days[^1].Billed, trends.Days[^1].Collected, trends.Days[^1].Tests));
        Assert.Equal((100m, 300m, 1), (trends.Days[^2].Billed, trends.Days[^2].Collected, trends.Days[^2].Tests));
        Assert.Equal((900m, 500m, 3), (trends.TotalBilled, trends.TotalCollected, trends.TotalTests));
        Assert.Equal([new TopTest("CBC", 2), new TopTest("LFT", 1)], trends.TopTests);
    }

    [Fact]
    public void NothingRecordedGivesFlatDaysAndNoTopTests()
    {
        var trends = OverviewTrends.Build(_store, Today);
        Assert.All(trends.Days, d => Assert.Equal((0m, 0m, 0), (d.Billed, d.Collected, d.Tests)));
        Assert.Empty(trends.TopTests);
    }
}
