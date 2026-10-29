using System.Net;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class OutboxAdminTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly VisitService _visits;

    public OutboxAdminTests() { _store = new LocalStore(_path); _visits = new VisitService(_store); }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private RegisteredVisit Visit(string phone = "9876543210", InitialPayment? pay = null) => _visits.Register(new RegisterVisitInput(Org, "l1", "2026-10-29",
        [new VisitTest("CBC", 300)], NewPatient: new NewPatient("Asha Rao", phone), Payment: pay));

    private async Task Refuse()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.BadRequest, """{"code":"22023","message":"Patient phone is required"}""") };
        await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();
    }

    [Fact]
    public async Task ListsRefusedItemsFirstWithTheServersReason()
    {
        Visit("9876500001");
        await Refuse();
        Visit("9876500002"); // a newer one, still waiting

        var list = _store.ListOutbox();
        Assert.Equal(["failed", "pending"], list.Select(e => e.Status));
        Assert.Equal(("Visit registration", "failed", "Patient phone is required", "Asha Rao"), (list[0].What, list[0].Badge, list[0].Detail, list[0].Who));
        Assert.Contains("when the connection", list[1].Detail); // a waiting item is not described as refused
    }

    [Fact]
    public async Task RetryPutsARefusedItemBackInTheQueue()
    {
        var v = Visit();
        await Refuse();

        OutboxAdmin.Retry(_store, v.VisitId);

        Assert.Equal("pending", _store.GetVisit(v.VisitId)!.Status);
        Assert.Equal(0, _store.GetVisit(v.VisitId)!.Attempts);
    }

    [Fact]
    public async Task DiscardingARefusedVisitRemovesTheBillTestsPaymentAndTheNewPatient()
    {
        var v = Visit(pay: new InitialPayment(300m));
        await Refuse();
        Assert.Equal(1, _store.InvoiceCount());

        OutboxAdmin.Discard(_store, v.VisitId);

        Assert.Equal(0, _store.InvoiceCount());
        Assert.Empty(_store.SearchWorklist(""));
        Assert.Empty(_store.PaymentsFor(v.VisitId));
        Assert.Equal(0, _store.PatientCount());
        Assert.Empty(_store.ListOutbox().Where(e => e.Kind is "visit" or "payment"));
    }

    [Fact]
    public async Task DiscardingAVisitKeepsAPatientThatHasOtherWork()
    {
        var first = Visit("9876500001");
        var patient = _store.SearchPatients("asha").Single();
        // A second visit for the same (still provisional) patient is waiting too.
        _visits.Register(new RegisterVisitInput(Org, "l1", "2026-10-29", [new VisitTest("LFT", 450)], ExistingPatient: patient));
        await Refuse();

        OutboxAdmin.Discard(_store, first.VisitId);

        Assert.Equal(1, _store.PatientCount()); // still needed by the second visit
        Assert.Equal(1, _store.InvoiceCount());
    }

    [Fact]
    public async Task DiscardingAPaymentJustDropsTheItem()
    {
        var v = Visit();
        _store.SetVisitStatus(v.VisitId, "done");
        new PaymentService(_store, Org).Record(new PaymentInput(v.VisitId, 100m));
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.BadRequest, """{"code":"22023","message":"too much"}""") };
        await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();
        var failed = _store.ListOutbox().Single(e => e.Status == "failed");

        OutboxAdmin.Discard(_store, failed.Id);

        Assert.Empty(_store.ListOutbox());
        Assert.Equal(1, _store.InvoiceCount()); // the bill itself stays
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
