using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class BillingAdminTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static Invoice Bill(string status = "partial", decimal paid = 100m) => new("inv-1", "INV-1", "p1", 300m, paid, status, "2026-10-29T10:00:00Z");

    private static FakeServer Details() => new()
    {
        Handler = (r, _) =>
        {
            var path = r.RequestUri!.AbsolutePath;
            if (path.EndsWith("invoice_items")) return (HttpStatusCode.OK, """[{"id":"i1","test_name":"CBC","unit_price":100,"quantity":1,"amount":100},{"id":"i2","test_name":"TSH","unit_price":200,"quantity":1,"amount":200}]""");
            if (path.EndsWith("/payments")) return (HttpStatusCode.OK, """[{"id":"pay1","amount":100,"payment_method":"upi","payment_date":"2026-10-29T10:05:00Z","transaction_id":"UPI-9","notes":"advance","received_by":"u-1"}]""");
            if (path.EndsWith("billing_audit")) return (HttpStatusCode.OK, """[{"changed_at":"2026-10-29T10:05:00Z","changed_by":"u-1","action":"payment_recorded","old_values":null,"new_values":{"amount":100,"payment_method":"upi"}},{"changed_at":"2026-10-29T10:00:00Z","changed_by":"u-2","action":"discount_updated","old_values":{"discount_amount":0},"new_values":{"discount_amount":20}}]""");
            if (path.EndsWith("/employees")) return (HttpStatusCode.OK, """[{"user_id":"u-1","full_name":"Asha Rao"}]""");
            return (HttpStatusCode.OK, "[]");
        },
    };

    [Fact]
    public async Task ShowsItemsPaymentsWithWhoTookThemAndTheHistoryInWords()
    {
        var details = await BillingAdmin.LoadAsync(Api(Details()), "org-1", "inv-1");

        Assert.Null(details.Error);
        Assert.Equal(["CBC", "TSH"], details.Items.Select(i => i.TestName));
        var payment = Assert.Single(details.Payments);
        Assert.Equal((100m, "upi", "UPI-9", "advance", "Asha Rao"), (payment.Amount, payment.Method, payment.TransactionId, payment.Notes, payment.ReceivedBy));
        Assert.Equal(["100 via upi", "Discount changed from 0 to 20"], details.History.Select(h => h.Summary));
        Assert.Equal("Unknown staff", details.History[1].ChangedBy); // u-2 is not in the staff list
    }

    [Fact]
    public async Task ExplainsOfflineAndRefusedDetails()
    {
        Assert.Contains("internet", (await BillingAdmin.LoadAsync(Api(new OfflineServer()), "o", "i")).Error);
        Assert.Contains("isn't allowed", (await BillingAdmin.LoadAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") }), "o", "i")).Error);
    }

    [Fact]
    public async Task EditingRepricesTheItemsAppliesTheDiscountAndWorksOutTheStatusLikeTheWebsite()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"x"}]""") };

        // 100 -> 150 and 200 -> 200: subtotal 350, discount 50 -> final 300; 100 has been paid -> partial
        var result = await BillingAdmin.EditAsync(Api(server), "org-1", "user-1", isAdmin: true, Bill(), [new("i1", 150m, 1m), new("i2", 200m, 1m)], 50m);

        Assert.True(result.Ok, result.Error);
        var patches = server.Requests.Where(r => r.Method.Method == "PATCH").ToList();
        Assert.Equal(3, patches.Count);
        Assert.Contains("/rest/v1/invoice_items?id=eq.i1&organization_id=eq.org-1", patches[0].Url);
        Assert.Equal(150m, JsonDocument.Parse(patches[0].Body).RootElement.GetProperty("amount").GetDecimal());
        var invoice = JsonDocument.Parse(patches[2].Body).RootElement;
        Assert.Contains("/rest/v1/invoices?id=eq.inv-1&organization_id=eq.org-1", patches[2].Url);
        Assert.Equal((350m, 50m, 300m, "partial", "user-1"), (invoice.GetProperty("total_amount").GetDecimal(), invoice.GetProperty("discount_amount").GetDecimal(),
            invoice.GetProperty("final_amount").GetDecimal(), invoice.GetProperty("payment_status").GetString(), invoice.GetProperty("discount_entered_by").GetString()));
        Assert.Equal(JsonValueKind.Null, invoice.GetProperty("paid_at").ValueKind);
    }

    [Theory]
    [InlineData(300, "paid")]    // paid 300 of a 300 bill
    [InlineData(500, "paid")]    // overpaid still counts as paid
    [InlineData(100, "partial")]
    [InlineData(0, "pending")]
    public async Task TheStatusFollowsWhatHasBeenPaid(int paid, string expected)
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"x"}]""") };
        await BillingAdmin.EditAsync(Api(server), "org-1", "u", true, Bill(paid: paid), [new("i1", 100m, 1m), new("i2", 200m, 1m)], 0m);
        Assert.Equal(expected, JsonDocument.Parse(server.Requests.Last().Body).RootElement.GetProperty("payment_status").GetString());
    }

    [Fact]
    public async Task TheDiscountIsNeverMoreThanTheSubtotalOrNegative()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"x"}]""") };
        await BillingAdmin.EditAsync(Api(server), "o", "u", true, Bill(), [new("i1", 100m, 1m)], 9999m);
        var body = JsonDocument.Parse(server.Requests.Last().Body).RootElement;
        Assert.Equal((100m, 0m), (body.GetProperty("discount_amount").GetDecimal(), body.GetProperty("final_amount").GetDecimal()));
        Assert.Equal(JsonValueKind.String, body.GetProperty("paid_at").ValueKind); // nothing left to pay: paid now
    }

    [Fact]
    public async Task OnlyAnAdminMayEditAPaidBillAndBadInputIsRefusedBeforeSendingAnything()
    {
        var server = new FakeServer();
        Assert.Contains("Only administrators", (await BillingAdmin.EditAsync(Api(server), "o", "u", isAdmin: false, Bill("paid", 300m), [new("i1", 1m, 1m)], 0m)).Error);
        Assert.Contains("negative", (await BillingAdmin.EditAsync(Api(server), "o", "u", true, Bill(), [new("i1", -5m, 1m)], 0m)).Error);
        Assert.Contains("no items", (await BillingAdmin.EditAsync(Api(server), "o", "u", true, Bill(), [], 0m)).Error);
        Assert.Empty(server.Requests);
        Assert.True((await BillingAdmin.EditAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"x"}]""") }), "o", "u", false, Bill("partial"), [new("i1", 1m, 1m)], 0m)).Ok); // an employee may edit an unpaid bill
    }

    [Fact]
    public async Task ARefusedOrHiddenEditIsReportedNotIgnored()
    {
        Assert.Contains("internet", (await BillingAdmin.EditAsync(Api(new OfflineServer()), "o", "u", true, Bill(), [new("i1", 1m, 1m)], 0m)).Error);
        var hidden = new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath.EndsWith("invoices") ? (HttpStatusCode.OK, "[]") : (HttpStatusCode.OK, """[{"id":"x"}]""") };
        Assert.Contains("did not accept", (await BillingAdmin.EditAsync(Api(hidden), "o", "u", true, Bill(), [new("i1", 1m, 1m)], 0m)).Error);
    }
}
