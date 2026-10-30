using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class ExternalLabAndCategoryTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly ExternalLabInput Lab = new(" Metro Labs ", "ML", "Ms Rao", "98765", "", "", "29ABCDE1234F1Z5", "");

    [Fact]
    public async Task AddsAnExternalLabWithTheWebsitesFields()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        Assert.True((await CatalogManage.AddExternalLabAsync(Api(server), "org-1", Lab)).Ok);
        var call = server.Requests.Single();
        Assert.EndsWith("/rest/v1/external_labs", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("Metro Labs", "ML", "Ms Rao", "29ABCDE1234F1Z5", "org-1"), (body.GetProperty("name").GetString(), body.GetProperty("code").GetString(),
            body.GetProperty("contact_person").GetString(), body.GetProperty("gst_number").GetString(), body.GetProperty("organization_id").GetString()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("email").ValueKind);
    }

    [Fact]
    public async Task RefusesANamelessLabAndReportsRefusedOrOfflineChanges()
    {
        var none = new FakeServer();
        Assert.Contains("Name", (await CatalogManage.AddExternalLabAsync(Api(none), "org-1", Lab with { Name = " " })).Error);
        Assert.Empty(none.Requests);

        var refused = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };
        Assert.False((await CatalogManage.UpdateExternalLabAsync(Api(refused), "org-1", "x1", Lab)).Ok);
        Assert.False((await CatalogManage.SetExternalLabActiveAsync(Api(refused), "org-1", "x1", false)).Ok);
        Assert.Contains("internet", (await CatalogManage.SetExternalLabActiveAsync(Api(new OfflineServer()), "org-1", "x1", false)).Error);
    }

    [Fact]
    public async Task SwitchesALabOffForThatOrganizationOnly()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"x1"}]""") };
        Assert.True((await CatalogManage.SetExternalLabActiveAsync(Api(server), "org-1", "x1", false)).Ok);
        var call = server.Requests.Single();
        Assert.Contains("/rest/v1/external_labs?id=eq.x1&organization_id=eq.org-1", call.Url);
        Assert.False(JsonDocument.Parse(call.Body).RootElement.GetProperty("is_active").GetBoolean());
    }

    [Fact]
    public async Task LoadsAnExternalLabForEditing()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"name":"Metro","code":null,"contact_person":"Ms Rao","phone":"1","email":null,"address":"A","gst_number":"G","notes":null}]""") };
        var (lab, error) = await CatalogManage.LoadExternalLabAsync(Api(server), "org-1", "x1");
        Assert.Null(error);
        Assert.Equal(new ExternalLabInput("Metro", "", "Ms Rao", "1", "", "A", "G", ""), lab);
    }

    [Fact]
    public async Task AddsACategoryUnlessTheNameIsMissingOrTaken()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        Assert.True((await CatalogManage.AddCategoryAsync(Api(server), "org-1", " Haematology ", "Blood tests", ["Biochemistry"])).Ok);
        var body = JsonDocument.Parse(server.Requests.Single().Body).RootElement;
        Assert.Equal(("Haematology", "Blood tests"), (body.GetProperty("name").GetString(), body.GetProperty("description").GetString()));

        server.Requests.Clear();
        Assert.Contains("already exists", (await CatalogManage.AddCategoryAsync(Api(server), "org-1", "biochemistry", "", ["Biochemistry"])).Error);
        Assert.Contains("required", (await CatalogManage.AddCategoryAsync(Api(server), "org-1", "  ", "", [])).Error);
        Assert.Empty(server.Requests);

        var clash = new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, """{"message":"dup"}""") };
        Assert.Contains("already exists", (await CatalogManage.AddCategoryAsync(Api(clash), "org-1", "Other", "", [])).Error);
    }
}
