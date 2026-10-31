using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class CatalogAdminTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    [Fact]
    public async Task ListsOnlyTheSwitchedOffTestsOfThisLab()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"t9","test_id":"OLD1","name":"Old Panel","price":120,"category_id":null,"unit":"mg","normal_range_min":1,"normal_range_max":2}]""") };

        var (tests, error) = await CatalogAdmin.InactiveTestsAsync(Api(server), "org-1");

        Assert.Null(error);
        Assert.Equal(("t9", "OLD1", "Old Panel", 120m, 1m, 2m), (tests[0].Id, tests[0].TestCode, tests[0].Name, tests[0].Price, tests[0].NormalMin, tests[0].NormalMax));
        Assert.Contains("organization_id=eq.org-1", server.Requests[0].Url);
        Assert.Contains("is_active=eq.false", server.Requests[0].Url);

        var (none, offline) = await CatalogAdmin.InactiveTestsAsync(Api(new OfflineServer()), "org-1");
        Assert.Empty(none);
        Assert.Contains("internet", offline);
    }

    [Fact]
    public async Task SendsTheNewPriceUnitAndRangeForThatTestOnly()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"t1"}]""") };

        var result = await CatalogAdmin.UpdateTestAsync(Api(server), "org-1", "t1", new TestEdit("350", " g/dL ", "13", "17.5", "", true));

        Assert.True(result.Ok);
        var call = server.Requests.Single();
        Assert.Equal("PATCH", call.Method.Method);
        Assert.Contains("/rest/v1/tests?id=eq.t1&organization_id=eq.org-1", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal((350m, "g/dL", 13m, 17.5m, true), (body.GetProperty("price").GetDecimal(), body.GetProperty("unit").GetString(),
            body.GetProperty("normal_range_min").GetDecimal(), body.GetProperty("normal_range_max").GetDecimal(), body.GetProperty("is_active").GetBoolean()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("normal_range_text").ValueKind); // blank means "no text range"
    }

    [Theory]
    [InlineData("abc", "", "", "as a number")]
    [InlineData("-5", "", "", "0 or more")]
    [InlineData("100", "x", "5", "numbers")]
    [InlineData("100", "20", "10", "lowest")]
    public async Task RefusesBadNumbersBeforeAskingTheServer(string price, string min, string max, string expected)
    {
        var server = new FakeServer();
        var result = await CatalogAdmin.UpdateTestAsync(Api(server), "org-1", "t1", new TestEdit(price, "", min, max, "", true));
        Assert.False(result.Ok);
        Assert.Contains(expected, result.Error);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task ExplainsOfflineAndNotAllowed()
    {
        var offline = await CatalogAdmin.UpdateTestAsync(Api(new OfflineServer()), "org-1", "t1", new TestEdit("1", "", "", "", "", true));
        Assert.Contains("internet", offline.Error);

        var denied = await CatalogAdmin.UpdateTestAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") }), "org-1", "t1", new TestEdit("1", "", "", "", "", true));
        Assert.False(denied.Ok);
        Assert.Contains("isn't allowed", denied.Error);
    }

    [Theory]
    [InlineData("Complete Blood Count", new string[0], "CBC001")]
    [InlineData("Complete Blood Count", new[] { "CBC001", "CBC002" }, "CBC003")]
    [InlineData("Glucose", new string[0], "GLUC001")]
    [InlineData("Vitamin D (25-OH)", new[] { "VD001" }, "VD002")]
    [InlineData("x", new string[0], "X001")]
    [InlineData("!!", new string[0], "TEST001")]
    public void NewTestCodesFollowTheWebsitesRule(string name, string[] existing, string expected) =>
        Assert.Equal(expected, CatalogAdmin.NextTestCode(name, existing));

    [Fact]
    public async Task AddsANewTestWithItsCodeForThisLabOnly()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "[]") };

        var result = await CatalogAdmin.AddTestAsync(Api(server), "org-1", new CatalogAdmin.NewTest(" Lipid Profile ", "450", "cat-1", "", "mg/dL", "", "", ""), ["LP001"]);

        Assert.True(result.Ok);
        var call = server.Requests.Single();
        Assert.Equal("POST", call.Method.Method);
        Assert.Contains("/rest/v1/tests", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("Lipid Profile", 450m, "org-1", "LP002", "Blood", "cat-1", true),
            (body.GetProperty("name").GetString(), body.GetProperty("price").GetDecimal(), body.GetProperty("organization_id").GetString(),
             body.GetProperty("test_id").GetString(), body.GetProperty("sample_type").GetString(), body.GetProperty("category_id").GetString(), body.GetProperty("is_active").GetBoolean()));
    }

    [Theory]
    [InlineData("", "10", "Enter the test name")]
    [InlineData("T", "abc", "price")]
    [InlineData("T", "-5", "price")]
    public async Task AddingATestChecksTheFormBeforeSendingAnything(string name, string price, string message)
    {
        var server = new FakeServer();
        var result = await CatalogAdmin.AddTestAsync(Api(server), "org-1", new CatalogAdmin.NewTest(name, price, null, "", "", "", "", ""), []);
        Assert.False(result.Ok);
        Assert.Contains(message, result.Error);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task AddingATestExplainsADuplicateAnOfflineComputerAndAMissingPermission()
    {
        var test = new CatalogAdmin.NewTest("T", "1", null, "", "", "", "", "");
        Assert.Contains("already exists", (await CatalogAdmin.AddTestAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, """{"message":"duplicate"}""") }), "o", test, [])).Error);
        Assert.Contains("internet", (await CatalogAdmin.AddTestAsync(Api(new OfflineServer()), "o", test, [])).Error);
        Assert.Contains("isn't allowed", (await CatalogAdmin.AddTestAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") }), "o", test, [])).Error);
    }
}
