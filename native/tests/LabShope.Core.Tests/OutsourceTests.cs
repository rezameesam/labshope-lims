using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class OutsourceTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly ResultService _results;

    public OutsourceTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog([new CatalogTest("t1", "HLA", "HLA typing", 2000m, null)], [], [], [], [], ExternalLabs: [new ExternalLab("x1", "Metropolis", "MP", "99")]));
        _results = new ResultService(_store, Org, "user-1", () => new DateTimeOffset(2026, 10, 29, 6, 0, 0, TimeSpan.Zero));
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private WorklistRow Order()
    {
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Asha Rao", "+919876543210", null, null));
        var visit = new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-29", [new VisitTest("HLA typing", 2000)], ExistingPatient: _store.GetPatient("p1")));
        _store.SetVisitStatus(visit.VisitId, "done"); // pretend the visit already reached the server
        return _store.SearchWorklist("", ["pending"]).Single();
    }

    [Fact]
    public void SendingATestToAnExternalLabShowsAtOnceAndQueuesTheUpdate()
    {
        var row = Order();

        var done = _results.Outsource(row.Id, "x1", "1200");

        Assert.Equal(("x1", 1200m, true), (done.ExternalLabId, done.OutsourceCost, done.Waiting));
        var listed = _store.SearchWorklist("", ["pending"]).Single();
        Assert.Equal("Metropolis", listed.OutsourcedTo);
        Assert.Contains("→  Metropolis", listed.TestLabel);
        Assert.Equal((1, 0), _store.OutboxCounts());
    }

    [Fact]
    public void RefusesBadInputAndASecondOutsourcing()
    {
        var row = Order();
        Assert.Contains("Pick an external lab", Assert.Throws<ArgumentException>(() => _results.Outsource(row.Id, "nope", "100")).Message);
        Assert.Contains("charges", Assert.Throws<ArgumentException>(() => _results.Outsource(row.Id, "x1", "0")).Message);
        Assert.Throws<ArgumentException>(() => _results.Outsource(row.Id, "x1", "abc"));
        _results.Outsource(row.Id, "x1", "100");
        Assert.Contains("already", Assert.Throws<ArgumentException>(() => _results.Outsource(row.Id, "x1", "100")).Message);
    }

    [Fact]
    public async Task SendsTheWebsitesColumnsForThatTestAndClearsWaitingOnlyWhenEverythingQueuedIsSent()
    {
        var row = Order();
        _results.Outsource(row.Id, "x1", "1200");
        _results.Enter(row.Id, "5"); // a result is queued for the same test too
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[{\"id\":\"x\"}]") };

        await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        var outsource = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.Equal(("x1", 1200m, "user-1"), (outsource.GetProperty("external_lab_id").GetString(), outsource.GetProperty("outsource_cost").GetDecimal(), outsource.GetProperty("outsourced_by").GetString()));
        Assert.Contains("outsourced_at", server.Requests[0].Body);
        Assert.Contains("id=eq." + row.Id, server.Requests[0].Url);
        Assert.False(_store.GetPatientTest(row.Id)!.Waiting); // both were sent
    }

    [Fact]
    public async Task TheTestStaysWaitingWhileAnotherChangeToItIsStillQueued()
    {
        var row = Order();
        _results.Outsource(row.Id, "x1", "1200");
        _results.Enter(row.Id, "5");
        var calls = 0;
        // The outsourcing is sent, then the connection drops before the result goes.
        var server = new FakeServer { Handler = (_, _) => ++calls == 1 ? (HttpStatusCode.OK, "[{\"id\":\"x\"}]") : (HttpStatusCode.ServiceUnavailable, "{}") };

        await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.True(_store.GetPatientTest(row.Id)!.Waiting); // the result is still queued
    }

    [Fact]
    public async Task ARefusedOutsourcingShowsTheTestAsNotOutsourcedAgain()
    {
        var row = Order();
        _results.Outsource(row.Id, "x1", "1200");
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(1, outcome.Failed);
        Assert.Null(_store.GetPatientTest(row.Id)!.ExternalLabId);
        Assert.Contains("external lab", _store.ListOutbox().Single().LastError);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
