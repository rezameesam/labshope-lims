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
}
