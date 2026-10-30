using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public sealed class NoticeBoardTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-nb-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private static readonly DateOnly Today = new(2026, 10, 30);

    public NoticeBoardTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "PAT1", "Asha Rao", "+919876543210", null, null));
        _store.UpsertPatient(new Patient("p2", "PAT2", "Ravi Kumar", "+918888888888", null, null));
    }

    public void Dispose() { _store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) try { File.Delete(f); } catch { } }

    [Fact]
    public void TestsAreLateAfterADayAndBillsAfterThirtyAndTheMostUrgentComeFirst()
    {
        _store.UpsertPatientTest(new PatientTest("t1", "p1", "CBC", "2026-10-30", "pending"));          // today: low
        _store.UpsertPatientTest(new PatientTest("t2", "p1", "LFT", "2026-10-29", "in_progress"));      // yesterday: medium
        _store.UpsertPatientTest(new PatientTest("t3", "p2", "TSH", "2026-10-25", "pending"));          // 5 days: high
        _store.UpsertPatientTest(new PatientTest("t4", "p2", "HbA1c", "2026-10-25", "completed"));      // finished: not a notice
        _store.UpsertInvoice(new Invoice("i1", "INV-1", "p1", 500m, 200m, "partial", "2026-10-20T09:00:00Z"));   // 10 days: medium
        _store.UpsertInvoice(new Invoice("i2", "INV-2", "p2", 300m, 0m, "pending", "2026-09-01T09:00:00Z"));     // 59 days: high
        _store.UpsertInvoice(new Invoice("i3", "INV-3", "p2", 300m, 300m, "paid", "2026-09-01T09:00:00Z"));      // paid: not a notice
        _store.UpsertInvoice(new Invoice("i4", "INV-4", "p2", 300m, 0m, "cancelled", "2026-09-01T09:00:00Z"));   // cancelled: not a notice

        var (notices, stats) = NoticeBoard.Build(_store, Today);

        Assert.Equal(new NoticeStats(3, 1, 2, 1), stats);
        Assert.Equal(5, stats.Total);
        Assert.Equal(["high", "high", "medium", "medium", "low"], notices.Select(n => n.Priority));
        Assert.Equal("Outstanding payment: ₹300", notices[0].Title);                // oldest high first (September)
        Assert.Contains("Test result pending: TSH", notices[1].Title);
        Assert.Contains("5 days waiting", notices[1].Description);
        Assert.Equal("Enter results", notices[1].Action);
        Assert.Equal("View bill", notices[0].Action);
        Assert.Contains("Outstanding payment: ₹300", notices.Select(n => n.Title)); // INV-1 owes 500 - 200
    }

    [Fact]
    public void NothingToDoGivesAnEmptyBoard()
    {
        _store.UpsertPatientTest(new PatientTest("t1", "p1", "CBC", "2026-10-30", "completed"));
        var (notices, stats) = NoticeBoard.Build(_store, Today);
        Assert.Empty(notices);
        Assert.Equal(0, stats.Total);
    }
}
