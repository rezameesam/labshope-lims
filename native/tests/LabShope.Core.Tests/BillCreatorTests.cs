using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class BillCreatorTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly PatientTest Cbc = new("t1", "p1", "CBC", "2026-10-30", "completed");
    private static readonly PatientTest Lft = new("t2", "p1", "LFT", "2026-10-30", "pending");
    private static readonly IReadOnlyList<PatientTest> Tests = [Cbc, Lft];
    private static readonly BillTestLine[] Lines = [new("t1", "CBC", 350m), new("t2", "LFT", 450m)];
    private static readonly Func<DateTimeOffset> Now = () => new DateTimeOffset(2026, 10, 30, 10, 0, 0, TimeSpan.Zero);
    private static readonly Guid Id = Guid.Parse("11111111-1111-1111-1111-111111111111");

    /// <param name="billedItems">rows returned for invoice_items</param><param name="billedInvoices">rows returned for invoices lookup</param>
    private static FakeServer Server(string billedItems = "[]", string billedInvoices = "[]", Func<HttpRequestMessage, (HttpStatusCode, string)?>? special = null) => new()
    {
        Handler = (r, _) =>
        {
            if (special?.Invoke(r) is { } custom) return custom;
            var path = r.RequestUri!.AbsolutePath;
            var isGet = r.Method == HttpMethod.Get;
            if (path.EndsWith("/rpc/generate_invoice_number")) return (HttpStatusCode.OK, "\"INV-000042\"");
            if (isGet && path.EndsWith("/invoice_items")) return (HttpStatusCode.OK, billedItems);
            if (isGet && path.EndsWith("/invoices")) return (HttpStatusCode.OK, billedInvoices);
            return (HttpStatusCode.Created, "");
        },
    };

    [Fact]
    public async Task CreatesTheBillWithTheNextNumberTheDiscountInTheFirstInsertAndOneItemPerTest()
    {
        var server = Server();
        var result = await BillCreator.CreateAsync(Api(server), "org-1", "user-1", "lab-1", "p1", Lines, "100", " walk-in ", Tests, now: Now, newId: () => Id);

        Assert.True(result.Ok, result.Error);
        Assert.Equal(("INV-000042", 700m, 100m, 0m), (result.Invoice!.InvoiceNumber, result.Invoice.TotalAmount, result.Invoice.Discount, result.Invoice.PaidAmount));
        var posts = server.Requests.Where(r => r.Method == HttpMethod.Post && !r.Url.Contains("/rpc/")).ToList();
        var invoice = JsonDocument.Parse(posts[0].Body).RootElement;
        Assert.EndsWith("/rest/v1/invoices", posts[0].Url);
        Assert.Equal((800m, 100m, 700m, "user-1", "walk-in", "lab-1", "p1"), (invoice.GetProperty("total_amount").GetDecimal(), invoice.GetProperty("discount_amount").GetDecimal(),
            invoice.GetProperty("final_amount").GetDecimal(), invoice.GetProperty("discount_entered_by").GetString(), invoice.GetProperty("notes").GetString(),
            invoice.GetProperty("lab_id").GetString(), invoice.GetProperty("patient_id").GetString()));
        var items = JsonDocument.Parse(posts[1].Body).RootElement;
        Assert.EndsWith("/rest/v1/invoice_items", posts[1].Url);
        Assert.Equal(["t1", "t2"], items.EnumerateArray().Select(i => i.GetProperty("patient_test_id").GetString()));
        Assert.All(items.EnumerateArray(), i => Assert.Equal(Id.ToString(), i.GetProperty("invoice_id").GetString()));
    }

    [Fact]
    public async Task ADiscountAboveTheBillIsCutBackAndNoDiscountMeansNobodyIsCredited()
    {
        var server = Server();
        var big = await BillCreator.CreateAsync(Api(server), "org-1", "user-1", null, "p1", Lines, "99999", null, Tests);
        Assert.Equal((800m, 0m), (big.Invoice!.Discount, big.Invoice.TotalAmount));

        var none = Server();
        await BillCreator.CreateAsync(Api(none), "org-1", "user-1", null, "p1", Lines, "", null, Tests);
        var body = JsonDocument.Parse(none.Requests.First(r => r.Url.EndsWith("/rest/v1/invoices") && r.Method == HttpMethod.Post).Body).RootElement;
        Assert.Equal(JsonValueKind.Null, body.GetProperty("discount_entered_by").ValueKind);
    }

    [Fact]
    public async Task ATestOnAPaidBillCannotBeBilledAgain()
    {
        var server = Server("""[{"patient_test_id":"t1","invoice_id":"i1"}]""", """[{"id":"i1","invoice_number":"INV-000007","payment_status":"paid"}]""");
        var result = await BillCreator.CreateAsync(Api(server), "org-1", "user-1", null, "p1", Lines, "", null, Tests, confirmedDuplicates: true);

        Assert.False(result.Ok);
        Assert.Contains("CBC is already on a paid bill (INV-000007)", result.Error);
        Assert.DoesNotContain(server.Requests, r => r.Method == HttpMethod.Post);
    }

    [Fact]
    public async Task ATestOnAnUnpaidBillNeedsConfirmationAndThenCreatesASecondBill()
    {
        var server = Server("""[{"patient_test_id":"t2","invoice_id":"i2"}]""", """[{"id":"i2","invoice_number":"INV-000009","payment_status":"pending"}]""");

        var ask = await BillCreator.CreateAsync(Api(server), "org-1", "user-1", null, "p1", Lines, "", null, Tests);
        Assert.False(ask.Ok);
        Assert.Equal("LFT", ask.NeedsConfirmation!.Single().TestName);
        Assert.Contains("second bill", ask.Error);
        Assert.DoesNotContain(server.Requests, r => r.Method == HttpMethod.Post);

        var go = await BillCreator.CreateAsync(Api(server), "org-1", "user-1", null, "p1", Lines, "", null, Tests, confirmedDuplicates: true);
        Assert.True(go.Ok, go.Error);
    }

    [Fact]
    public async Task ACancelledBillDoesNotBlockBillingTheTestAgain()
    {
        var server = Server("""[{"patient_test_id":"t1","invoice_id":"i1"}]""", """[{"id":"i1","invoice_number":"INV-000007","payment_status":"cancelled"}]""");
        Assert.True((await BillCreator.CreateAsync(Api(server), "org-1", "user-1", null, "p1", Lines, "", null, Tests)).Ok);
    }

    [Fact]
    public async Task IfTheItemsCannotBeSavedTheEmptyBillIsRemoved()
    {
        var server = Server(special: r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath.EndsWith("/invoice_items") ? (HttpStatusCode.InternalServerError, """{"message":"boom"}""") : null);
        var result = await BillCreator.CreateAsync(Api(server), "org-1", "user-1", null, "p1", Lines, "", null, Tests, newId: () => Id);

        Assert.False(result.Ok);
        Assert.Contains("boom", result.Error);
        var cleanup = server.Requests.Last();
        Assert.Equal("DELETE", cleanup.Method.Method);
        Assert.Contains($"/rest/v1/invoices?id=eq.{Id}", cleanup.Url);
    }

    [Fact]
    public async Task RefusesNothingPickedBadPricesBadDiscountsAndSaysWhenOffline()
    {
        var server = Server();
        Assert.Contains("at least one", (await BillCreator.CreateAsync(Api(server), "org-1", null, null, "p1", [], "", null, Tests)).Error);
        Assert.Contains("0 or more", (await BillCreator.CreateAsync(Api(server), "org-1", null, null, "p1", [new("t1", "CBC", -5m)], "", null, Tests)).Error);
        Assert.Contains("discount as a number", (await BillCreator.CreateAsync(Api(server), "org-1", null, null, "p1", Lines, "lots", null, Tests)).Error);
        Assert.Empty(server.Requests);

        Assert.Contains("internet", (await BillCreator.CreateAsync(Api(new OfflineServer()), "org-1", null, null, "p1", Lines, "", null, Tests)).Error);
    }
}
