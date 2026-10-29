using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class PaymentTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly VisitService _visits;
    private readonly PaymentService _payments;

    public PaymentTests()
    {
        _store = new LocalStore(_path);
        _visits = new VisitService(_store, () => new DateTimeOffset(2026, 10, 29, 4, 0, 0, TimeSpan.Zero), () => 4242);
        _payments = new PaymentService(_store, Org, () => new DateTimeOffset(2026, 10, 29, 4, 5, 0, TimeSpan.Zero));
    }

    private int _next;

    // Each call is a different person with their own number (the same number would raise the duplicate-phone choice).
    private RegisteredVisit Visit(InitialPayment? pay = null) => _visits.Register(new RegisterVisitInput(
        Org, "lab-1", "2026-10-29", [new VisitTest("CBC", 300), new VisitTest("LFT", 450)],
        NewPatient: new NewPatient("Asha Rao", $"98765{++_next:00000}"), Payment: pay));

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    // ── on this PC ─────────────────────────────────────────────────────────

    [Fact]
    public void RegisteringCreatesTheBillOnThisPcWithAProvisionalNumber()
    {
        var visit = Visit();
        var bill = _store.GetInvoice(visit.VisitId)!;

        Assert.Equal(750m, bill.TotalAmount);
        Assert.Equal("pending", bill.PaymentStatus);
        Assert.Equal("L-261029-0001", bill.InvoiceNumber);
        Assert.Equal("L-261029-0002", Visit().InvoiceNumber);
        Assert.True(PaymentService.IsProvisional(bill.InvoiceNumber));
    }

    [Fact]
    public void CollectingAtTheCounterGivesAReceiptAndQueuesThePayment()
    {
        var visit = Visit(new InitialPayment(750m, "upi", "UPI9"));

        var receipt = visit.Receipt!;
        Assert.Equal(("paid", 750m, 0m), (receipt.Status, receipt.Paid, receipt.Balance));
        Assert.Equal("upi", receipt.Method);
        Assert.True(receipt.Provisional);
        Assert.Equal("paid", _store.GetInvoice(visit.VisitId)!.PaymentStatus);
        Assert.Equal((2, 0), _store.OutboxCounts()); // the visit and its payment
    }

    [Fact]
    public void APartPaymentLeavesABalanceAndALaterOneSettlesIt()
    {
        var visit = Visit(new InitialPayment(300m));
        Assert.Equal(("partial", 450m), (_store.GetInvoice(visit.VisitId)!.PaymentStatus, 750m - _store.GetInvoice(visit.VisitId)!.PaidAmount));

        var second = _payments.Record(new PaymentInput(visit.VisitId, 450m, "card"));
        Assert.Equal("paid", second.Status);
        Assert.Equal(2, _store.PaymentsFor(visit.VisitId).Count);
    }

    [Fact]
    public void RefusesMoreThanTheBalanceZeroAndUnknownBills()
    {
        var visit = Visit(new InitialPayment(700m));
        Assert.Contains("more than the balance", Assert.Throws<ArgumentException>(() => _payments.Record(new PaymentInput(visit.VisitId, 51m))).Message);
        Assert.Throws<ArgumentException>(() => _payments.Record(new PaymentInput(visit.VisitId, 0m)));
        Assert.Throws<ArgumentException>(() => _payments.Record(new PaymentInput("nope", 10m)));
        Assert.Throws<ArgumentException>(() => _payments.Record(new PaymentInput(visit.VisitId, 10m, "bitcoin")));
        Assert.Equal(50m, 750m - _store.GetInvoice(visit.VisitId)!.PaidAmount);
    }

    [Fact]
    public void TheDailyCashBookTotalsTakingsByMethod()
    {
        var a = Visit(new InitialPayment(750m, "cash"));
        var b = Visit(new InitialPayment(300m, "upi"));
        _payments.Record(new PaymentInput(b.VisitId, 100m, "cash"));

        var book = _store.TakingsBetween("2026-10-29T00:00:00", "2026-10-30T00:00:00").ToDictionary(x => x.Method);
        Assert.Equal((850m, 2), (book["cash"].Total, book["cash"].Count));
        Assert.Equal((300m, 1), (book["upi"].Total, book["upi"].Count));
    }

    // ── sending ────────────────────────────────────────────────────────────

    [Fact]
    public async Task SendsTheVisitThenItsPaymentAndTheBillGetsItsOfficialNumber()
    {
        var visit = Visit(new InitialPayment(750m, "cash"));
        var called = new List<string>();
        var server = new FakeServer { Handler = (req, _) =>
        {
            var fn = req.RequestUri!.AbsolutePath.Split('/').Last();
            called.Add(fn);
            return fn == "register_visit"
                ? (HttpStatusCode.OK, "{\"patient_uuid\":\"" + _store.SearchPatients("asha").Single().Id + "\",\"patient_code\":\"IRM-5\",\"invoice_number\":\"INV2600042\"}")
                : (HttpStatusCode.OK, """{"payment_status":"paid","paid_amount":750,"balance":0}""");
        } };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(new FlushOutcome(2, 0, null), outcome);
        Assert.Equal(["register_visit", "record_payment"], called); // the bill must exist before it can be paid
        Assert.Equal("INV2600042", _store.GetInvoice(visit.VisitId)!.InvoiceNumber);
        Assert.True(_store.PaymentsFor(visit.VisitId).Single().Synced);
        var payload = JsonDocument.Parse(server.Requests.Last().Body).RootElement.GetProperty("p_payload");
        Assert.Equal(visit.VisitId, payload.GetProperty("invoice_id").GetString());
        Assert.Equal(750m, payload.GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task APaymentTheServerRefusesIsTakenBackOffTheBill()
    {
        var visit = Visit();
        _store.SetVisitStatus(visit.VisitId, "done"); // pretend the visit already reached the server
        _payments.Record(new PaymentInput(visit.VisitId, 400m));
        Assert.Equal(400m, _store.GetInvoice(visit.VisitId)!.PaidAmount);

        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.BadRequest, """{"code":"22023","message":"Payment is more than the balance due (100)"}""") };
        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(1, outcome.Failed);
        Assert.Equal(0m, _store.GetInvoice(visit.VisitId)!.PaidAmount);
        Assert.Empty(_store.PaymentsFor(visit.VisitId));
    }

    [Fact]
    public async Task APaymentStaysQueuedWhenTheServerDoesNotHaveTheFunctionYet()
    {
        var visit = Visit(new InitialPayment(750m));
        var server = new FakeServer { Handler = (req, _) => req.RequestUri!.AbsolutePath.EndsWith("record_payment")
            ? (HttpStatusCode.NotFound, """{"code":"PGRST202","message":"Could not find the function public.record_payment"}""")
            : (HttpStatusCode.OK, """{"patient_uuid":"x","invoice_number":"INV1"}""") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(ErrorKind.Transient, outcome.StoppedBy);
        Assert.Equal(0, outcome.Failed);
        Assert.Equal(750m, _store.GetInvoice(visit.VisitId)!.PaidAmount); // the money taken is still on the bill
        Assert.Single(_store.PaymentsFor(visit.VisitId));
    }

    [Fact]
    public async Task APaymentWaitsQuietlyWhenOffline()
    {
        var visit = Visit(new InitialPayment(750m));
        var outcome = await new SyncEngine(_store, Api(new OfflineServer()), Org).FlushOutboxAsync();

        Assert.Equal(ErrorKind.Network, outcome.StoppedBy);
        Assert.Equal("paid", _store.GetInvoice(visit.VisitId)!.PaymentStatus); // the counter keeps working
        Assert.Equal((2, 0), _store.OutboxCounts());
    }

    [Fact]
    public void ABillWithNoWaitingPaymentsHasZeroWaiting()
    {
        var visit = Visit();
        Assert.Equal(0m, _store.UnsyncedPaymentTotal(visit.VisitId));
        Assert.Equal(0m, _store.UnsyncedPaymentTotal("no-such-bill"));
    }

    [Fact]
    public async Task APullDoesNotWipeMoneyTakenOnThisPcThatIsStillWaiting()
    {
        var visit = Visit();
        _store.SetVisitStatus(visit.VisitId, "done");
        _payments.Record(new PaymentInput(visit.VisitId, 300m));

        var row = "[{\"id\":\"" + visit.VisitId + "\",\"invoice_number\":\"INV2600042\",\"patient_id\":\"" + _store.GetInvoice(visit.VisitId)!.PatientId +
                  "\",\"total_amount\":750,\"paid_amount\":0,\"payment_status\":\"pending\",\"created_at\":\"2026-10-29T04:00:00+00:00\",\"updated_at\":\"2026-10-29T04:00:00+00:00\"}]";
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, row) };
        await new SyncEngine(_store, Api(server), Org).PullInvoicesAsync();

        var bill = _store.GetInvoice(visit.VisitId)!;
        Assert.Equal("INV2600042", bill.InvoiceNumber);
        Assert.Equal((300m, "partial"), (bill.PaidAmount, bill.PaymentStatus));
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}

public class ReceiptHtmlTests
{
    private static Receipt R(decimal balance, bool provisional) => new("p1", provisional ? "L-261029-0001" : "INV2600042", provisional, "Asha <Rao>", 750m, 300m, 750m - balance, balance, balance > 0 ? "partial" : "paid", "upi", "2026-10-29T04:00:00+00:00");

    [Fact]
    public void ShowsTheAmountsAndEscapesNames()
    {
        var html = ReceiptHtml.Build(R(450m, false), "Demo & Lab");
        Assert.Contains("Demo &amp; Lab", html);
        Assert.Contains("Asha &lt;Rao&gt;", html);
        Assert.Contains("300.00", html);
        Assert.Contains("PART PAYMENT", html);
        Assert.DoesNotContain("Provisional receipt", html);
    }

    [Fact]
    public void ProvisionalReceiptsSayTheNumberIsNotOfficialYet()
    {
        var html = ReceiptHtml.Build(R(0m, true), "Demo Lab");
        Assert.Contains("PAID IN FULL", html);
        Assert.Contains("Provisional receipt", html);
    }
}
