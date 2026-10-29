using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class ResultTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly VisitService _visits;
    private readonly ResultService _results;

    public ResultTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog(
            [new CatalogTest("t1", "HB", "Haemoglobin", 200m, null, Unit: "g/dL", NormalRangeText: "13 - 17", NormalMin: 13m, NormalMax: 17m),
             new CatalogTest("t2", "BG", "Blood Group", 100m, null)],
            [], [], [], []));
        _visits = new VisitService(_store);
        _results = new ResultService(_store, Org, "user-1", () => new DateTimeOffset(2026, 10, 29, 6, 0, 0, TimeSpan.Zero));
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private (RegisteredVisit Visit, IReadOnlyList<WorklistRow> Rows) Order(params string[] tests)
    {
        var visit = _visits.Register(new RegisterVisitInput(Org, "lab-1", "2026-10-29", tests.Select(t => new VisitTest(t, 100)).ToList(),
            NewPatient: new NewPatient("Asha Rao", "9876543210")));
        return (visit, _store.SearchWorklist("", ["pending", "in_progress"]));
    }

    [Fact]
    public void ARegisteredVisitPutsItsTestsOnTheWorklistAtOnceAndTheServerGetsTheSameIds()
    {
        var (visit, rows) = Order("Haemoglobin", "Blood Group");

        Assert.Equal(["Haemoglobin", "Blood Group"], rows.Select(r => r.TestName));
        Assert.All(rows, r => Assert.Equal("Asha Rao", r.PatientName));

        var payload = JsonDocument.Parse(_store.GetVisit(visit.VisitId)!.PayloadJson).RootElement.GetProperty("tests");
        Assert.Equal(rows.Select(r => r.Id), payload.EnumerateArray().Select(t => t.GetProperty("id").GetString()));
    }

    [Fact]
    public void ANumberOutsideTheRangeIsFlaggedAbnormalAndTheUnitComesFromTheCatalog()
    {
        var (_, rows) = Order("Haemoglobin");

        var low = _results.Enter(rows[0].Id, "11.2");

        Assert.Equal(("completed", 11.2m, "g/dL", true, true), (low.Status, low.ResultValue, low.ResultUnit, low.IsAbnormal, low.Waiting));
        Assert.Equal("13 - 17", low.NormalRangeText);
        Assert.Empty(_store.SearchWorklist("", ["pending", "in_progress"])); // gone from the to-do list
    }

    [Fact]
    public void ANumberInsideTheRangeIsNormalEvenIfTheCashierTickedAbnormal()
    {
        var (_, rows) = Order("Haemoglobin");
        Assert.False(_results.Enter(rows[0].Id, "14.5", markedAbnormal: true).IsAbnormal); // the range decides, as on the website
    }

    [Fact]
    public void AWordResultIsKeptAsTextAndUsesTheMarkedFlag()
    {
        var (_, rows) = Order("Blood Group");
        var done = _results.Enter(rows[0].Id, "O positive", markedAbnormal: false);
        Assert.Equal(("O positive", null), (done.Result, done.ResultValue));
    }

    [Fact]
    public void RefusesAnEmptyResultAndAnUnknownTest()
    {
        var (_, rows) = Order("Haemoglobin");
        Assert.Throws<ArgumentException>(() => _results.Enter(rows[0].Id, "  "));
        Assert.Throws<ArgumentException>(() => _results.Enter("nope", "1"));
    }

    [Fact]
    public async Task SendsTheResultAfterTheVisitAsAnUpdateOfThatTestRow()
    {
        var (_, rows) = Order("Haemoglobin");
        _results.Enter(rows[0].Id, "11.2");
        var calls = new List<string>();
        var server = new FakeServer { Handler = (req, _) =>
        {
            calls.Add(req.Method + " " + req.RequestUri!.AbsolutePath.Split('/').Last());
            return req.Method.Method == "PATCH" ? (HttpStatusCode.OK, "[{\"id\":\"" + rows[0].Id + "\"}]") : (HttpStatusCode.OK, """{"patient_uuid":"x","invoice_number":"INV1"}""");
        } };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(new FlushOutcome(2, 0, null), outcome);
        Assert.Equal(["POST register_visit", "PATCH patient_tests"], calls); // the row must exist before it is updated
        var patch = server.Requests.Last();
        Assert.Contains("id=eq." + rows[0].Id, patch.Url);
        Assert.Contains("organization_id=eq.org-1", patch.Url);
        var body = JsonDocument.Parse(patch.Body).RootElement;
        Assert.Equal(("completed", 11.2m, true, "user-1"), (body.GetProperty("status").GetString(), body.GetProperty("result_value").GetDecimal(), body.GetProperty("is_abnormal").GetBoolean(), body.GetProperty("result_entered_by").GetString()));
        Assert.False(_store.GetPatientTest(rows[0].Id)!.Waiting);
    }

    [Fact]
    public async Task AResultTheServerWillNotAcceptGoesBackOnTheWorklist()
    {
        var (visit, rows) = Order("Haemoglobin");
        _store.SetVisitStatus(visit.VisitId, "done");
        _results.Enter(rows[0].Id, "11.2");
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") }; // nothing matched: not found or not allowed

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(1, outcome.Failed);
        var test = _store.GetPatientTest(rows[0].Id)!;
        Assert.Equal(("pending", null, false), (test.Status, test.ResultValue, test.Waiting));
        Assert.Single(_store.SearchWorklist("", ["pending"]));
    }

    [Fact]
    public async Task AResultWaitsQuietlyWhenOffline()
    {
        var (visit, rows) = Order("Haemoglobin");
        _store.SetVisitStatus(visit.VisitId, "done");
        _results.Enter(rows[0].Id, "14");

        var outcome = await new SyncEngine(_store, Api(new OfflineServer()), Org).FlushOutboxAsync();

        Assert.Equal(ErrorKind.Network, outcome.StoppedBy);
        Assert.Equal("completed", _store.GetPatientTest(rows[0].Id)!.Status);
    }

    [Fact]
    public async Task APullBringsResultsFromOtherComputersButNeverOverwritesOneStillWaitingHere()
    {
        var (visit, rows) = Order("Haemoglobin", "Blood Group");
        _store.SetVisitStatus(visit.VisitId, "done");
        _results.Enter(rows[0].Id, "11.2"); // entered here, not yet sent

        string Row(string id, string name, string status, string value) =>
            $$"""{"id":"{{id}}","patient_id":"{{_store.GetPatientTest(id)!.PatientId}}","test_name":"{{name}}","test_date":"2026-10-29","status":"{{status}}","result":null,"result_value":{{value}},"result_unit":"g/dL","normal_range_text":null,"is_abnormal":false,"updated_at":"2026-10-29T07:00:00+00:00"}""";
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[" + Row(rows[0].Id, "Haemoglobin", "completed", "99") + "," + Row(rows[1].Id, "Blood Group", "completed", "5") + "]") };

        await new SyncEngine(_store, Api(server), Org).PullPatientTestsAsync();

        Assert.Equal(11.2m, _store.GetPatientTest(rows[0].Id)!.ResultValue);   // ours is still waiting: kept
        Assert.Equal(5m, _store.GetPatientTest(rows[1].Id)!.ResultValue);       // someone else's: taken
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
