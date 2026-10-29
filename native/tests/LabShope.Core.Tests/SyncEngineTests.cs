using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;

namespace LabShope.Core.Tests;

public class SyncEngineTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    public SyncEngineTests() => _store = new LocalStore(_path);

    private static SupabaseApi Api(HttpMessageHandler handler)
    {
        var api = new SupabaseApi(new HttpClient(handler), "https://x.supabase.co", "anon")
        {
            Session = new AuthSession("tok", "ref", DateTimeOffset.UtcNow.AddHours(1), "user-1", "a@b.c")
        };
        return api;
    }

    private static string PatientRows(params (string id, string code, string name, string at)[] rows) =>
        "[" + string.Join(",", rows.Select(r =>
            $$"""{"id":"{{r.id}}","patient_id":"{{r.code}}","full_name":"{{r.name}}","phone":"9999999999","gender":null,"date_of_birth":null,"is_active":true,"updated_at":"{{r.at}}"}""")) + "]";

    private static string VisitPayload(string visitId, string patientId) =>
        "{\"visit_id\":\"" + visitId + "\",\"organization_id\":\"org-1\",\"patient\":{\"new\":{\"id\":\"" + patientId +
        "\",\"full_name\":\"Asha Rao\",\"phone\":\"9999999999\"}},\"tests\":[{\"test_name\":\"CBC\",\"price\":300}]}";

    // ── catalog ────────────────────────────────────────────────────────────

    private static (HttpStatusCode, string) CatalogRoute(HttpRequestMessage req) => req.RequestUri!.AbsolutePath switch
    {
        var p when p.EndsWith("/tests") => (HttpStatusCode.OK, """[{"id":"t1","test_id":"CBC","name":"CBC","price":300,"category_id":"c1"},{"id":"t2","test_id":"LFT","name":"LFT","price":450,"category_id":"c1"}]"""),
        var p when p.EndsWith("/test_packages") => (HttpStatusCode.OK, """[{"id":"pk1","name":"Basic","price":500}]"""),
        var p when p.EndsWith("/test_package_tests") => (HttpStatusCode.OK, """[{"package_id":"pk1","test_id":"t1"},{"package_id":"pk1","test_id":"t2"}]"""),
        var p when p.EndsWith("/doctors") => (HttpStatusCode.OK, """[{"id":"d1","name":"Dr Rao","specialization":"Pathology","commission_percentage":10}]"""),
        var p when p.EndsWith("/labs") => (HttpStatusCode.OK, """[{"id":"l1","name":"Main Lab","lab_code":"ML"}]"""),
        var p when p.EndsWith("/collection_centers") => (HttpStatusCode.OK, """[{"id":"cc1","name":"Town","code":"TN","lab_id":"l1"}]"""),
        var p when p.EndsWith("/external_labs") => (HttpStatusCode.OK, """[{"id":"x1","name":"Metropolis","code":"MP","phone":"99"}]"""),
        var p when p.EndsWith("/test_categories") => (HttpStatusCode.OK, """[{"id":"c1","name":"Blood"}]"""),
        var p when p.EndsWith("/test_templates") => (HttpStatusCode.OK, """[{"id":"tp1","name":"Standard","organization_id":null,"test_category":null,"test_id":null,"header_template":"<p>Patient: {patient_name}</p>","footer_template":null,"result_format":"table","include_normal_range":true,"include_abnormal_flag":false,"include_notes":false,"is_default":true}]"""),
        _ => (HttpStatusCode.NotFound, "{}"),
    };

    [Fact]
    public async Task CopiesTheCatalogToThisPcAndSkipsARefreshThatIsTooSoon()
    {
        var server = new FakeServer { Handler = (r, _) => CatalogRoute(r) };
        var engine = new SyncEngine(_store, Api(server), Org);

        Assert.True(await engine.PullCatalogAsync());
        var catalog = _store.GetCatalog();
        Assert.Equal(["CBC", "LFT"], catalog.Tests.Select(t => t.Name));
        Assert.Equal(["t1", "t2"], catalog.Packages.Single().TestIds);
        Assert.Equal("Dr Rao", catalog.Doctors.Single().Name);
        Assert.Equal("Town", catalog.Centers.Single().Name);
        Assert.Equal("Blood", catalog.CategoryList.Single().Name);
        Assert.Equal("Metropolis", catalog.ExternalLabList.Single().Name);
        var template = catalog.TemplateList.Single();
        Assert.Equal(("Standard", true, true, false), (template.Name, template.IsDefault, template.IncludeNormalRange, template.IncludeAbnormalFlag));

        var calls = server.Requests.Count;
        Assert.False(await engine.PullCatalogAsync());
        Assert.Equal(calls, server.Requests.Count);
        Assert.True(await engine.PullCatalogAsync(force: true));
    }

    [Fact]
    public async Task AFailedCatalogRefreshKeepsTheCopyAlreadyOnThisPc()
    {
        var engine = new SyncEngine(_store, Api(new FakeServer { Handler = (r, _) => CatalogRoute(r) }), Org);
        await engine.PullCatalogAsync();

        var broken = new SyncEngine(_store, Api(new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath.EndsWith("/doctors")
            ? (HttpStatusCode.InternalServerError, "{}") : CatalogRoute(r) }), Org);
        await Assert.ThrowsAsync<SyncException>(() => broken.PullCatalogAsync(force: true));

        Assert.Equal(2, _store.GetCatalog().Tests.Count);
    }

    // ── sending visits ─────────────────────────────────────────────────────

    private void Enqueue(string visitId, string patientId) =>
        _store.EnqueueVisit(new OutboxItem(visitId, VisitPayload(visitId, patientId), "pending", 0, null, "Asha Rao", 300m));

    [Fact]
    public async Task SendsAQueuedVisitAndAdoptsTheServersPatientCode()
    {
        _store.UpsertPatient(new Patient("local-1", "PENDING", "Asha Rao", "9999999999", null, null, Pending: true));
        Enqueue("v1", "local-1");
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"patient_uuid":"local-1","patient_code":"IRM-0042","invoice_number":"INV-1"}""") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(new FlushOutcome(1, 0, null), outcome);
        Assert.Equal("done", _store.GetVisit("v1")!.Status);
        var patient = _store.GetPatient("local-1")!;
        Assert.Equal("IRM-0042", patient.PatientCode);
        Assert.False(patient.Pending);
        Assert.Contains("/rest/v1/rpc/register_visit", server.Requests.Single().Url);
    }

    [Fact]
    public async Task DropsTheLocalPatientWhenTheServerMatchedAnExistingOne()
    {
        _store.UpsertPatient(new Patient("local-1", "PENDING", "Asha Rao", "9999999999", null, null, Pending: true));
        Enqueue("v1", "local-1");
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"patient_uuid":"server-9","patient_code":"IRM-0001"}""") };

        await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Null(_store.GetPatient("local-1"));
    }

    [Fact]
    public async Task KeepsTheVisitQueuedWhenOffline()
    {
        Enqueue("v1", "local-1");
        var outcome = await new SyncEngine(_store, Api(new OfflineServer()), Org).FlushOutboxAsync();

        Assert.Equal(ErrorKind.Network, outcome.StoppedBy);
        Assert.Equal("pending", _store.GetVisit("v1")!.Status);
        Assert.Equal(1, _store.GetVisit("v1")!.Attempts);
    }

    [Fact]
    public async Task MovesARefusedVisitToFailedAndCarriesOn()
    {
        Enqueue("v1", "local-1");
        Enqueue("v2", "local-2");
        var n = 0;
        var server = new FakeServer { Handler = (_, _) => ++n == 1
            ? (HttpStatusCode.BadRequest, """{"code":"22023","message":"invalid payload"}""")
            : (HttpStatusCode.OK, """{"patient_uuid":"local-2","patient_code":"IRM-2"}""") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(new FlushOutcome(1, 1, null), outcome);
        Assert.Equal("failed", _store.GetVisit("v1")!.Status);
        Assert.Equal("invalid payload", _store.GetVisit("v1")!.LastError);
        Assert.Equal("done", _store.GetVisit("v2")!.Status);
    }

    [Fact]
    public async Task RefreshesAnExpiredTokenAndRetriesOnce()
    {
        Enqueue("v1", "local-1");
        var rpcCalls = 0;
        var server = new FakeServer { Handler = (req, _) =>
        {
            if (req.RequestUri!.AbsolutePath.EndsWith("/token"))
                return (HttpStatusCode.OK, """{"access_token":"new","refresh_token":"r2","expires_in":3600,"user":{"id":"user-1","email":"a@b.c"}}""");
            return ++rpcCalls == 1
                ? (HttpStatusCode.Unauthorized, """{"code":"PGRST301","message":"JWT expired"}""")
                : (HttpStatusCode.OK, """{"patient_uuid":"local-1","patient_code":"IRM-3"}""");
        } };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(1, outcome.Synced);
        Assert.Equal(2, rpcCalls);
    }

    [Fact]
    public async Task ReplayingTheSameVisitNeverDuplicatesTheQueue()
    {
        Enqueue("v1", "local-1");
        Enqueue("v1", "local-1");
        Assert.Equal((1, 0), _store.OutboxCounts());
        await Task.CompletedTask;
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}

public class SyncRunnerTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    public SyncRunnerTests() => _store = new LocalStore(_path);

    private SyncRunner Runner(HttpMessageHandler handler) =>
        new(new SyncEngine(_store, new SupabaseApi(new HttpClient(handler), "https://x.supabase.co", "anon")
        { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) }, "org-1"), _store);

    [Fact]
    public async Task ReportsOnlineAfterASuccessfulRound()
    {
        var status = await Runner(new FakeServer()).RunOnceAsync();
        Assert.True(status.Online);
        Assert.NotNull(status.LastSyncedAt);
    }

    [Fact]
    public async Task ReportsOfflineAndKeepsTheCountOfWaitingVisits()
    {
        _store.EnqueueVisit(new OutboxItem("v1", "{\"patient\":{\"id\":\"p\"}}", "pending", 0, null, "A", 100m));
        var status = await Runner(new OfflineServer()).RunOnceAsync();

        Assert.False(status.Online);
        Assert.Equal(1, status.Pending);
    }

    [Fact]
    public async Task ReportsWhenTheLoginHasEnded()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Unauthorized, """{"code":"PGRST301","message":"JWT expired"}""") };
        var status = await Runner(server).RunOnceAsync();
        Assert.True(status.NeedsSignIn);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
