using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Notify;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public sealed class PaymentNotifyTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-pn-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    public PaymentNotifyTests()
    {
        _store = new LocalStore(_path);
        _store.SaveBranding(Branding.FromContext("""{"organization":{"display_name":"Sunrise Diagnostics","primary_phone":"+911","primary_email":"hi@sunrise.example"},"primary_lab":{"address":"12 Park Road","city":"Pune"},"settings":{}}""", "x")!);
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Asha Rao", "+919876543210", null, null));
    }

    public void Dispose() { _store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) try { File.Delete(f); } catch { } }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static (HttpStatusCode, string) Route(HttpRequestMessage req, string? email = "asha@example.com", string settings = "[]")
    {
        var path = req.RequestUri!.AbsolutePath;
        if (path.EndsWith("/patients")) return (HttpStatusCode.OK, "[{\"full_name\":\"Asha Rao\",\"email\":" + (email is null ? "null" : $"\"{email}\"") + "}]");
        if (path.EndsWith("/organization_settings")) return (HttpStatusCode.OK, settings);
        if (path.EndsWith("/system_settings")) return (HttpStatusCode.OK, "[]");
        if (path.EndsWith("/send-email")) return (HttpStatusCode.OK, """{"success":true}""");
        if (path.EndsWith("/rpc/record_payment")) return (HttpStatusCode.OK, """{"payment_id":"x","replayed":false}""");
        if (path.EndsWith("/rpc/register_visit")) return (HttpStatusCode.OK, """{"patient_uuid":"p1","invoice_number":"INV1"}""");
        return (HttpStatusCode.OK, "[{\"id\":\"x\"}]");
    }

    // A visit worth 700 whose bill is already on the server, paid in part.
    private Invoice BillWithBalance(decimal alreadyPaid = 0m)
    {
        var visit = new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-30", [new VisitTest("CBC", 300), new VisitTest("LFT", 400)], ExistingPatient: _store.GetPatient("p1")));
        _store.SetVisitStatus(visit.VisitId, "done");
        if (alreadyPaid > 0) { new PaymentService(_store, Org).Record(new PaymentInput(visit.VisitId, alreadyPaid, "cash")); _store.SetVisitStatus(_store.NextPendingVisit()!.VisitId, "done"); }
        return _store.GetInvoice(visit.VisitId)!;
    }

    [Fact]
    public async Task APaymentThatSettlesTheBillEmailsThePatientWithTheWebsitesWording()
    {
        var bill = BillWithBalance();
        new PaymentService(_store, Org).Record(new PaymentInput(bill.Id, 700m, "cash", NotifyPatient: true));
        var server = new FakeServer { Handler = (r, _) => Route(r) };
        var engine = new SyncEngine(_store, Api(server), Org);

        await engine.FlushOutboxAsync();
        Assert.Single(_store.PendingPaymentNotifications()); // queued only after the payment reached the server
        Assert.Equal(1, await engine.SendPaymentNotificationsAsync("sunrise", "Sunrise"));

        var body = JsonDocument.Parse(server.Requests.Single(r => r.Url.EndsWith("/functions/v1/send-email")).Body).RootElement;
        Assert.Equal("asha@example.com", body.GetProperty("to").GetString());
        Assert.Equal("Payment Received - View Your Reports", body.GetProperty("subject").GetString());
        var html = body.GetProperty("htmlContent").GetString()!;
        Assert.Contains("Dear Asha Rao", html);
        Assert.Contains("We have received your payment of ₹700.00 for invoice", html);
        Assert.Contains("Sunrise Diagnostics", html);
        Assert.Contains("https://sunrise.labshope.com/auth/patient", html);
        Assert.Empty(_store.PendingPaymentNotifications()); // told once
    }

    [Fact]
    public async Task APaymentTakenWhileRegisteringAVisitDoesNotEmailBecauseNoResultsExistYet()
    {
        var visit = new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-30", [new VisitTest("CBC", 300)], ExistingPatient: _store.GetPatient("p1"),
            Payment: new InitialPayment(300m, "cash")));
        var server = new FakeServer { Handler = (r, _) => Route(r) };
        var engine = new SyncEngine(_store, Api(server), Org);

        await engine.FlushOutboxAsync();
        await engine.SendPaymentNotificationsAsync("sunrise", "Sunrise");

        Assert.Equal("paid", _store.GetInvoice(visit.VisitId)!.PaymentStatus);
        Assert.Empty(_store.PendingPaymentNotifications());
        Assert.DoesNotContain(server.Requests, r => r.Url.EndsWith("/send-email"));
    }

    [Fact]
    public async Task APartPaymentSendsNothing()
    {
        var bill = BillWithBalance();
        new PaymentService(_store, Org).Record(new PaymentInput(bill.Id, 200m, "cash", NotifyPatient: true));
        var server = new FakeServer { Handler = (r, _) => Route(r) };
        var engine = new SyncEngine(_store, Api(server), Org);

        await engine.FlushOutboxAsync();
        await engine.SendPaymentNotificationsAsync("sunrise", "Sunrise");

        Assert.Empty(_store.PendingPaymentNotifications());
        Assert.DoesNotContain(server.Requests, r => r.Url.EndsWith("/send-email"));
    }

    [Fact]
    public async Task OnePatientIsToldOnceEvenWhenTheBillTookTwoPayments()
    {
        var bill = BillWithBalance();
        var payments = new PaymentService(_store, Org);
        payments.Record(new PaymentInput(bill.Id, 300m, "cash", NotifyPatient: true));
        payments.Record(new PaymentInput(bill.Id, 400m, "upi", NotifyPatient: true));
        var server = new FakeServer { Handler = (r, _) => Route(r) };
        var engine = new SyncEngine(_store, Api(server), Org);

        await engine.FlushOutboxAsync();
        await engine.SendPaymentNotificationsAsync("sunrise", "Sunrise");

        Assert.Single(server.Requests, r => r.Url.EndsWith("/send-email"));
        Assert.Contains("₹700.00", JsonDocument.Parse(server.Requests.Single(r => r.Url.EndsWith("/send-email")).Body).RootElement.GetProperty("htmlContent").GetString()!);
    }

    [Fact]
    public async Task NoAddressMeansNothingIsSentAndOfflineKeepsItQueued()
    {
        var bill = BillWithBalance();
        new PaymentService(_store, Org).Record(new PaymentInput(bill.Id, 700m, "cash", NotifyPatient: true));
        await new SyncEngine(_store, Api(new FakeServer { Handler = (r, _) => Route(r) }), Org).FlushOutboxAsync();

        await new SyncEngine(_store, Api(new OfflineServer()), Org).SendPaymentNotificationsAsync("sunrise", "Sunrise");
        Assert.Single(_store.PendingPaymentNotifications()); // tried again at the next sync

        var noEmail = new FakeServer { Handler = (r, _) => Route(r, email: null) };
        await new SyncEngine(_store, Api(noEmail), Org).SendPaymentNotificationsAsync("sunrise", "Sunrise");
        Assert.DoesNotContain(noEmail.Requests, r => r.Url.EndsWith("/send-email"));
        Assert.Empty(_store.PendingPaymentNotifications());
    }

    [Fact]
    public async Task UsesTheLabsOwnPaymentWordingWhenItSetsOne()
    {
        var bill = BillWithBalance();
        new PaymentService(_store, Org).Record(new PaymentInput(bill.Id, 700m, "cash", NotifyPatient: true));
        const string custom = """[{"setting_key":"notification_payment_received_subject","setting_value":"Thanks {patient_name}"},{"setting_key":"notification_payment_received_message","setting_value":"Got ₹{amount}{invoice_suffix} at {business_name}"}]""";
        var server = new FakeServer { Handler = (r, _) => Route(r, settings: custom) };
        var engine = new SyncEngine(_store, Api(server), Org);
        await engine.FlushOutboxAsync();
        await engine.SendPaymentNotificationsAsync("sunrise", "Sunrise");

        var body = JsonDocument.Parse(server.Requests.Single(r => r.Url.EndsWith("/send-email")).Body).RootElement;
        Assert.Equal("Thanks Asha Rao", body.GetProperty("subject").GetString());
        Assert.Contains("Got ₹700.00 for invoice", body.GetProperty("htmlContent").GetString()!);
        Assert.Contains("at Sunrise Diagnostics", body.GetProperty("htmlContent").GetString()!);
    }
}
