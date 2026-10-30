using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public sealed class RepeatTestsTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-rt-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private static readonly DateOnly Today = new(2026, 10, 30);

    public RepeatTestsTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "PAT1", "Asha", "", null, null));
        _store.UpsertPatient(new Patient("p2", "PAT2", "Ravi", "", null, null));
    }

    public void Dispose() { _store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) try { File.Delete(f); } catch { } }

    private void Order(string id, string patient, string test, string date, string status = "pending") =>
        _store.UpsertPatientTest(new PatientTest(id, patient, test, date, status));

    [Fact]
    public void FlagsTestsOrderedInTheLast30DaysWithTheWebsitesRiskLevels()
    {
        Order("a", "p1", "CBC", "2026-10-27");      // 3 days: high
        Order("b", "p1", "LFT", "2026-10-10", "completed"); // 20 days: medium
        Order("c", "p1", "TSH", "2026-09-01");      // too old
        Order("d", "p1", "HbA1c", "2026-10-29");    // not chosen
        Order("e", "p2", "CBC", "2026-10-29");      // someone else

        var found = RepeatTests.Find(_store, "p1", ["cbc", "LFT", "TSH"], Today);

        Assert.Equal(["CBC", "LFT"], found.Select(f => f.TestName)); // most recent first, names matched ignoring case
        Assert.Equal(["high", "medium"], found.Select(f => f.Risk));
        Assert.Equal("CBC was ordered 3 day(s) ago on 27/10/2026 (pending)", found[0].Text);
    }

    [Fact]
    public void KeepsOnlyTheLatestOrderOfATestAndSaysToday()
    {
        Order("a", "p1", "CBC", "2026-10-01");
        Order("b", "p1", "CBC", "2026-10-30", "in_progress");

        var found = RepeatTests.Find(_store, "p1", ["CBC"], Today).Single();

        Assert.Equal((0, "high"), (found.DaysAgo, found.Risk));
        Assert.Equal("CBC was already ordered today (in progress)", found.Text);
    }

    [Fact]
    public void NothingChosenOrNothingRecentMeansNoWarning()
    {
        Order("a", "p1", "CBC", "2026-08-01");
        Assert.Empty(RepeatTests.Find(_store, "p1", [], Today));
        Assert.Empty(RepeatTests.Find(_store, "p1", ["CBC"], Today));
    }
}
