using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public sealed class VisitFlowTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-flow-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private static readonly DateOnly Today = new(2026, 10, 30);
    private const string Day = "2026-10-30";

    public VisitFlowTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "PAT1", "Asha Rao", "+919876543210", null, null));
        _store.UpsertPatient(new Patient("p2", "PAT2", "Ravi Kumar", "+918888888888", null, null));
        _store.UpsertPatient(new Patient("p3", "PAT3", "Meera Nair", "+917777777777", null, null));
    }

    public void Dispose() { _store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) try { File.Delete(f); } catch { } }

    private void Test(string id, string patient, string name, string status, string date = Day, string? externalLab = null) =>
        _store.UpsertPatientTest(new PatientTest(id, patient, name, date, status, ExternalLabId: externalLab));

    private void Bill(string id, string patient, decimal total, decimal paid, string created = "2026-10-30T09:00:00Z") =>
        _store.UpsertInvoice(new Invoice(id, "INV-" + id, patient, total, paid, paid >= total ? "paid" : paid > 0 ? "partial" : "pending", created));

    [Fact]
    public void EachVisitGetsAStageFromItsTestsAndItsBill()
    {
        Test("a1", "p1", "CBC", "pending"); Test("a2", "p1", "LFT", "pending");                  // nothing started
        Test("b1", "p2", "CBC", "completed"); Test("b2", "p2", "LFT", "pending");                 // half done
        Test("c1", "p3", "CBC", "completed"); Bill("c", "p3", 350m, 100m);                        // all done, money owed
        Test("d1", "p3", "TSH", "completed", date: "2026-10-29"); Bill("d", "p3", 400m, 400m, "2026-10-29T09:00:00Z"); // all done, paid, yesterday

        var board = VisitFlow.Build(_store, Today.AddDays(-1), Today).ToDictionary(v => (v.PatientCode, v.Date));

        Assert.Equal(VisitStage.Waiting, board[("PAT1", Day)].Stage);
        Assert.Equal(VisitStage.Testing, board[("PAT2", Day)].Stage);
        Assert.Equal(VisitStage.Ready, board[("PAT3", Day)].Stage);
        Assert.Equal(250m, board[("PAT3", Day)].Due);
        Assert.Equal("Take payment, then give the report", board[("PAT3", Day)].NextStep);
        Assert.Equal(VisitStage.Done, board[("PAT3", "2026-10-29")].Stage);
        Assert.Equal("1/2 done", board[("PAT2", Day)].Progress);
    }

    [Fact]
    public void AnExternalLabTestCountsAsUnderWayAndAnInProgressTestToo()
    {
        Test("a1", "p1", "CBC", "pending", externalLab: "x1");
        Test("b1", "p2", "CBC", "in_progress"); Test("b2", "p2", "LFT", "pending");

        var board = VisitFlow.Build(_store, Today, Today);

        Assert.All(board, v => Assert.Equal(VisitStage.Testing, v.Stage));
    }

    [Fact]
    public void AnUnfinishedVisitFromAnEarlierDayStaysOnTheBoardAndFinishedOldOnesDoNot()
    {
        Test("old1", "p1", "CBC", "pending", date: "2026-10-01");
        Test("old2", "p2", "CBC", "completed", date: "2026-10-01");
        Test("now1", "p3", "CBC", "pending");

        var board = VisitFlow.Build(_store, Today, Today);

        Assert.Equal(["PAT1", "PAT3"], board.Select(v => v.PatientCode).OrderBy(c => c)); // the finished old one is out of range
    }

    [Fact]
    public void AVisitWithoutABillIsDoneWhenItsTestsAreAndTheBoardIsOrderedByWhatNeedsDoing()
    {
        Test("a1", "p1", "CBC", "completed");
        Test("b1", "p2", "CBC", "pending");
        Test("c1", "p3", "CBC", "completed"); Bill("c", "p3", 100m, 0m);

        var board = VisitFlow.Build(_store, Today, Today);

        Assert.Equal([VisitStage.Waiting, VisitStage.Ready, VisitStage.Done], board.Select(v => v.Stage));
        Assert.Equal("no bill", board[2].BillText);
        Assert.Equal("₹100 due", board[1].BillText);
    }

    [Fact]
    public void ASummaryNamesTheFirstTestsAndCountsTheRest()
    {
        foreach (var (name, n) in new[] { "CBC", "LFT", "TSH", "HbA1c", "Vit D" }.Select((x, i) => (x, i))) Test("t" + n, "p1", name, "pending");
        Assert.Equal("CBC, LFT +3 more", VisitFlow.Build(_store, Today, Today).Single().TestsSummary);
    }

    [Fact]
    public void StartingTestingMovesOnlyWaitingTestsAndQueuesEachForTheServer()
    {
        Test("a1", "p1", "CBC", "pending"); Test("a2", "p1", "LFT", "completed"); Test("a3", "p1", "TSH", "pending", externalLab: "x1");
        var results = new ResultService(_store, "org-1", "user-1", () => new DateTimeOffset(2026, 10, 30, 6, 0, 0, TimeSpan.Zero));

        var started = results.StartTesting(["a1", "a2", "a3", "a1", "missing"]);

        Assert.Equal(1, started); // the finished one, the one at an outside lab, the repeat and the unknown id are all skipped
        Assert.Equal("in_progress", _store.GetPatientTest("a1")!.Status);
        Assert.True(_store.GetPatientTest("a1")!.Waiting);
        Assert.Equal("completed", _store.GetPatientTest("a2")!.Status);
        var queued = _store.NextPendingVisit()!;
        Assert.Equal("result", queued.Kind);
        var payload = JsonDocument.Parse(queued.PayloadJson).RootElement;
        Assert.Equal(("a1", "org-1", "in_progress", "user-1"), (payload.GetProperty("id").GetString(), payload.GetProperty("organization_id").GetString(),
            payload.GetProperty("patch").GetProperty("status").GetString(), payload.GetProperty("patch").GetProperty("updated_by").GetString()));
        Assert.Equal(VisitStage.Testing, VisitFlow.Build(_store, Today, Today).Single().Stage);
        Assert.Equal(1, _store.OutboxCounts().Pending);
    }
}
