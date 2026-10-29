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

public class DiscountTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    public DiscountTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Asha Rao", "+919876543210", null, null));
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    // A bill made on the website: price 1000, 200 discount, so 800 is payable.
    private const string Row = """[{"id":"i1","invoice_number":"INV2600001","patient_id":"p1","total_amount":1000,"final_amount":800,"discount_amount":200,"paid_amount":0,"payment_status":"pending","created_at":"2026-10-29T04:00:00+00:00","updated_at":"2026-10-29T04:00:00+00:00"}]""";

    private async Task PullDiscounted() =>
        await new SyncEngine(_store, Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, Row) }), Org).PullInvoicesAsync();

    [Fact]
    public async Task ADiscountedBillIsOwedAtItsFinalAmountNotItsFullPrice()
    {
        await PullDiscounted();

        var bill = _store.SearchBills("").Single();
        Assert.Equal((800m, 200m, 800m), (bill.TotalAmount, bill.Discount, bill.Balance)); // not 1000
        Assert.Equal(800m, _store.GetDashboard("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z").UnpaidBalance);
        Assert.Equal(800m, _store.GetReport("2026-10-29", "2026-10-29", 0).Billed); // reports count what was billed, after the discount
    }

    [Fact]
    public async Task PayingTheFinalAmountSettlesTheBillAndMoreThanThatIsRefused()
    {
        await PullDiscounted();
        var payments = new PaymentService(_store, Org);

        Assert.Contains("more than the balance due (800)", Assert.Throws<ArgumentException>(() => payments.Record(new PaymentInput("i1", 801m))).Message);
        var receipt = payments.Record(new PaymentInput("i1", 800m));

        Assert.Equal(("paid", 0m, 200m), (receipt.Status, receipt.Balance, receipt.Discount));
        Assert.Equal("paid", _store.GetInvoice("i1")!.PaymentStatus); // fully paid, not "partial"
    }

    [Fact]
    public async Task TheReceiptShowsThePriceTheDiscountAndWhatWasBilled()
    {
        await PullDiscounted();
        var receipt = new PaymentService(_store, Org).Record(new PaymentInput("i1", 800m));

        var html = ReceiptHtml.Build(receipt, "Lab");

        Assert.Contains("1000.00", html);   // the price
        Assert.Contains("-200.00", html);   // the discount
        Assert.Contains("PAID IN FULL", html);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}

public class PulledPaymentTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    public PulledPaymentTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Asha Rao", "+919876543210", null, null));
        _store.UpsertInvoice(new Invoice("i1", "INV1", "p1", 1000m, 700m, "partial", "2026-10-29T04:00:00+00:00"));
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private const string Rows = """
        [{"id":"w1","invoice_id":"i1","amount":500,"payment_method":"cash","transaction_id":null,"notes":null,"payment_date":"2026-10-29T10:30:00+05:30","created_at":"2026-10-29T05:00:00.5+00:00"},
         {"id":"w2","invoice_id":"i1","amount":200,"payment_method":"upi","transaction_id":"U1","notes":null,"payment_date":"2026-10-29T06:00:00+00:00","created_at":"2026-10-29T06:00:01+00:00"}]
        """;

    [Fact]
    public async Task PaymentsTakenOnTheWebsiteOrAnotherComputerReachTheCashBookAndTotals()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, Rows) };
        await new SyncEngine(_store, Api(server), Org).PullPaymentsAsync();

        var book = _store.TakingsBetween("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z").ToDictionary(t => t.Method);
        Assert.Equal((500m, 200m), (book["cash"].Total, book["upi"].Total));
        Assert.Equal(700m, _store.GetDashboard("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z").TakingsToday);
        Assert.Equal(700m, _store.GetReport("2026-10-29", "2026-10-29", 0).Collected);
        // The server's offset was turned into one fixed UTC form (10:30 at +05:30 is 05:00Z).
        Assert.Equal("2026-10-29T05:00:00.000Z", _store.PaymentsFor("i1").Single(p => p.Id == "w1").PaidAt);
        Assert.All(_store.PaymentsFor("i1"), p => Assert.True(p.Synced));
        Assert.Contains("/rest/v1/payments?", server.Requests[0].Url);
        Assert.Contains("order=created_at.asc,id.asc", server.Requests[0].Url);
    }

    [Fact]
    public async Task APaymentMadeOnThisPcIsNotCountedTwiceWhenItComesBackFromTheServer()
    {
        _store.AddPayment(new LocalPayment("w1", "i1", 500m, "cash", null, null, "2026-10-29T05:00:00.000Z", Synced: false)); // ours, still waiting
        await new SyncEngine(_store, Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, Rows) }), Org).PullPaymentsAsync();

        Assert.Equal(2, _store.PaymentsFor("i1").Count);
        Assert.Equal(700m, _store.TakingsBetween("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z").Sum(t => t.Total));
    }

    [Fact]
    public async Task OnlyNewPaymentsAreAskedForTheNextTime()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, Rows) };
        var engine = new SyncEngine(_store, Api(server), Org);
        await engine.PullPaymentsAsync();
        server.Handler = (_, _) => (HttpStatusCode.OK, "[]");
        await engine.PullPaymentsAsync();

        Assert.Contains("or=", server.Requests.Last().Url);
        Assert.Contains("created_at.gt.2026-10-29T06%3A00%3A01", server.Requests.Last().Url); // from the last one seen
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
