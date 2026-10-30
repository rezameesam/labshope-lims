using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class TemplateAdminTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly TemplateInput T = new(" Haematology report ", "Haematology", null, " <h1>{lab_name}</h1> ", "", "table", true, true, false, "", false);

    [Fact]
    public async Task AddsATemplateWithTheWebsitesFields()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        Assert.True((await TemplateAdmin.AddAsync(Api(server), "org-1", T)).Ok);
        var call = server.Requests.Single();
        Assert.EndsWith("/rest/v1/test_templates", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("Haematology report", "Haematology", "<h1>{lab_name}</h1>", "table", "org-1", false),
            (body.GetProperty("name").GetString(), body.GetProperty("test_category").GetString(), body.GetProperty("header_template").GetString(),
             body.GetProperty("result_format").GetString(), body.GetProperty("organization_id").GetString(), body.GetProperty("include_notes").GetBoolean()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("footer_template").ValueKind);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("test_id").ValueKind);
    }

    [Theory]
    [InlineData("", "table", "name")]
    [InlineData("X", "grid", "laid out")]
    public async Task RefusesBadInputBeforeAskingTheServer(string name, string format, string expected)
    {
        var server = new FakeServer();
        var result = await TemplateAdmin.AddAsync(Api(server), "org-1", T with { Name = name, ResultFormat = format });
        Assert.Contains(expected, result.Error, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task UpdateAndDeleteAreLimitedToTheLabsOwnTemplatesAndSayWhenRefused()
    {
        var ok = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"t1"}]""") };
        Assert.True((await TemplateAdmin.UpdateAsync(Api(ok), "org-1", "t1", T)).Ok);
        Assert.Contains("/rest/v1/test_templates?id=eq.t1&organization_id=eq.org-1", ok.Requests.Single().Url);
        Assert.True((await TemplateAdmin.DeleteAsync(Api(ok), "org-1", "t1")).Ok);
        Assert.Equal("DELETE", ok.Requests[1].Method.Method);

        var shared = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };
        Assert.Contains("shared template", (await TemplateAdmin.UpdateAsync(Api(shared), "org-1", "t1", T)).Error);
        Assert.Contains("shared template", (await TemplateAdmin.DeleteAsync(Api(shared), "org-1", "t1")).Error);
        Assert.Contains("internet", (await TemplateAdmin.AddAsync(Api(new OfflineServer()), "org-1", T)).Error);
        Assert.Contains("isn't allowed", (await TemplateAdmin.AddAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") }), "org-1", T)).Error);
    }

    [Fact]
    public async Task ReadsTheCustomCssForEditing()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"custom_css":"body{color:red}"}]""") };
        Assert.Equal("body{color:red}", await TemplateAdmin.LoadCssAsync(Api(server), "org-1", "t1"));
        Assert.Equal("", await TemplateAdmin.LoadCssAsync(Api(new OfflineServer()), "org-1", "t1"));
    }
}
