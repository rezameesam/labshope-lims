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
             new CatalogTest("t2", "BG", "Blood Group", 100m, null),
             new CatalogTest("t3", "CRP", "CRP", 300m, null, Unit: "mg/L", NormalMax: 6m), // only an upper limit
             new CatalogTest("t4", "VITD", "Vitamin D", 900m, null, Unit: "ng/mL", NormalMin: 30m), // only a lower limit
             new CatalogTest("t5", "TSH", "TSH", 400m, null, Unit: "mIU/L", NormalMin: 0.004m, NormalMax: 4m)],
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

    [Theory]
    [InlineData("CRP", "48", true)]
    [InlineData("CRP", "5", false)]
    [InlineData("Vitamin D", "12", true)]
    [InlineData("Vitamin D", "45", false)]
    public void ARangeWithOnlyOneLimitStillFlagsTheOtherSide(string test, string value, bool abnormal)
    {
        var (_, rows) = Order(test);
        Assert.Equal(abnormal, _results.Enter(rows[0].Id, value).IsAbnormal);
    }

    [Fact]
    public void SmallValuesAreNeverRoundedAwayOnTheWorklistOrTheReport()
    {
        var (_, rows) = Order("TSH");
        var saved = _results.Enter(rows[0].Id, "0.004");

        Assert.Equal(0.004m, saved.ResultValue);
        Assert.Equal("0.004", ResultFormat.Number(saved.ResultValue!.Value));
        Assert.Equal("0.004 mIU/L", _store.SearchWorklist("", ["completed"]).Single().ResultText);
        Assert.Equal("12.345", ResultFormat.Number(12.345m));
        Assert.Equal("5.5", ResultFormat.Number(5.50m));
        Assert.Equal("1250", ResultFormat.Number(1250m));
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

    // ── panel (multi-value) results ────────────────────────────────────────

    [Fact]
    public void CbcStartsWithTheWebsitesTwentyRowsAndOtherTestsStartEmpty()
    {
        var cbc = PanelDefaults.For("CBC (Complete Blood Count)");
        Assert.Equal(20, cbc.Count);
        Assert.Equal(("HGB", "g/dL", "11.5", "16.5"), (cbc[7].Name, cbc[7].Unit, cbc[7].Min, cbc[7].Max));
        Assert.Empty(PanelDefaults.For("Blood Group"));
        Assert.Equal(20, PanelDefaults.For("complete blood picture").Count);
    }

    [Fact]
    public void APanelIsAbnormalWhenAnyRowIsOutsideItsRange()
    {
        var (_, rows) = Order("CBC");
        var items = PanelDefaults.For("CBC").Select(i => i.Name switch { "HGB" => i with { Value = "9.8" }, "WBC" => i with { Value = "6.1" }, _ => i }).ToList();

        var done = _results.EnterPanel(rows[0].Id, items);

        Assert.True(done.IsAbnormal);
        Assert.Equal("completed", done.Status);
        Assert.Null(done.ResultValue);
        var stored = ResultItem.ParseAll(_store.GetPatientTest(rows[0].Id)!.ResultItemsJson);
        Assert.Equal(20, stored.Count); // like the website, every named row is kept, filled or not
        Assert.Equal(["WBC", "HGB"], stored.Where(i => i.Value != "").Select(i => i.Name));
        Assert.Equal("2 values", _store.SearchWorklist("", ["completed"]).Single().ResultText);
    }

    [Fact]
    public void APanelWithEverythingInRangeIsNormalAndTextValuesAreAllowed()
    {
        var (_, rows) = Order("CBC");
        var done = _results.EnterPanel(rows[0].Id, [new ResultItem("WBC", "6.1", "10^9/L", "3.5", "10.0", ""), new ResultItem("Film", "Normocytic", "", "", "", "")]);
        Assert.False(done.IsAbnormal);
    }

    [Fact]
    public void ARowWithoutAnyValueIsRefused()
    {
        var (_, rows) = Order("CBC");
        Assert.Throws<ArgumentException>(() => _results.EnterPanel(rows[0].Id, PanelDefaults.For("CBC")));
        Assert.Throws<ArgumentException>(() => _results.EnterPanel(rows[0].Id, []));
    }

    [Fact]
    public async Task APanelIsSentInTheWebsitesFormat()
    {
        var (visit, rows) = Order("CBC");
        _store.SetVisitStatus(visit.VisitId, "done");
        _results.EnterPanel(rows[0].Id, [new ResultItem("HGB", "9.8", "g/dL", "11.5", "16.5", ""), new ResultItem("Film", "Normocytic", "", "", "", "RBC morphology")]);
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[{\"id\":\"x\"}]") };

        await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        var body = JsonDocument.Parse(server.Requests.Single().Body).RootElement;
        var items = body.GetProperty("result_items");
        Assert.Equal(("HGB", 9.8m, "g/dL", 11.5m, 16.5m), (items[0].GetProperty("name").GetString(), items[0].GetProperty("value").GetDecimal(), items[0].GetProperty("unit").GetString(),
            items[0].GetProperty("normal_range_min").GetDecimal(), items[0].GetProperty("normal_range_max").GetDecimal()));
        Assert.Equal("Normocytic", items[1].GetProperty("value").GetString()); // a word stays a word
        Assert.Equal(JsonValueKind.Null, items[1].GetProperty("normal_range_min").ValueKind);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("result_value").ValueKind);
        Assert.True(body.GetProperty("is_abnormal").GetBoolean());
    }

    [Fact]
    public async Task APullBringsPanelResultsEnteredElsewhere()
    {
        var (visit, rows) = Order("CBC");
        _store.SetVisitStatus(visit.VisitId, "done");
        var pid = _store.GetPatientTest(rows[0].Id)!.PatientId;
        var row = "[{\"id\":\"" + rows[0].Id + "\",\"patient_id\":\"" + pid + "\",\"test_name\":\"CBC\",\"test_date\":\"2026-10-29\",\"status\":\"completed\",\"result\":null,\"result_value\":null,\"result_unit\":null,\"normal_range_text\":null,\"is_abnormal\":true," +
                  "\"result_items\":[{\"name\":\"HGB\",\"value\":9.8,\"unit\":\"g/dL\",\"normal_range_min\":11.5,\"normal_range_max\":16.5,\"normal_range_text\":null}],\"updated_at\":\"2026-10-29T07:00:00+00:00\"}]";
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, row) };

        await new SyncEngine(_store, Api(server), Org).PullPatientTestsAsync();

        var items = ResultItem.ParseAll(_store.GetPatientTest(rows[0].Id)!.ResultItemsJson);
        Assert.Equal(("HGB", "9.8", true), (items[0].Name, items[0].Value, items[0].IsAbnormal));
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
