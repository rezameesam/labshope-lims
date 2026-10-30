using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class OrgAdminTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly LabInput Lab = new(" ml ", " Main Lab ", "main", null, "1 Road", "Pune", "MH", "411001", "98765", "", true, "18.52", "73.85", true, "FAC1");

    [Fact]
    public async Task AddsALabWithAnUpperCaseCodeAndTheMapAndAbdmSettings()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        Assert.True((await OrgAdmin.AddLabAsync(Api(server), "org-1", Lab)).Ok);
        var call = server.Requests.Single();
        Assert.EndsWith("/rest/v1/labs", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("ML", "Main Lab", "main", "org-1"), (body.GetProperty("lab_code").GetString(), body.GetProperty("name").GetString(), body.GetProperty("type").GetString(), body.GetProperty("organization_id").GetString()));
        var settings = body.GetProperty("settings");
        Assert.Equal((true, "FAC1", 18.52, 73.85), (settings.GetProperty("abdm_enabled").GetBoolean(), settings.GetProperty("abdm_facility_id").GetString(), settings.GetProperty("map_latitude").GetDouble(), settings.GetProperty("map_longitude").GetDouble()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("email").ValueKind);
    }

    [Theory]
    [InlineData("", "Name", "main", "", "", "required")]
    [InlineData("C", "Name", "weird", "", "", "type")]
    [InlineData("C", "Name", "main", "91", "", "Latitude")]
    [InlineData("C", "Name", "main", "", "181", "Longitude")]
    [InlineData("C", "Name", "main", "abc", "", "Latitude")]
    public async Task RefusesBadLabInputBeforeAskingTheServer(string code, string name, string type, string lat, string lon, string expected)
    {
        var server = new FakeServer();
        var result = await OrgAdmin.AddLabAsync(Api(server), "org-1", Lab with { Code = code, Name = name, Type = type, Latitude = lat, Longitude = lon });
        Assert.Contains(expected, result.Error, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task AnEditKeepsSettingsThisAppDoesNotShow()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"l1"}]""") };
        var full = new LabFull("l1", Lab, JsonNode.Parse("""{"report_footer":"keep me","abdm_enabled":false}""")!.AsObject());
        Assert.True((await OrgAdmin.UpdateLabAsync(Api(server), "org-1", full, Lab with { AbdmEnabled = false })).Ok);
        var call = server.Requests.Single();
        Assert.Contains("/rest/v1/labs?id=eq.l1&organization_id=eq.org-1", call.Url);
        var settings = JsonDocument.Parse(call.Body).RootElement.GetProperty("settings");
        Assert.Equal("keep me", settings.GetProperty("report_footer").GetString());
        Assert.False(settings.GetProperty("abdm_enabled").GetBoolean());
        Assert.Contains("own parent", (await OrgAdmin.UpdateLabAsync(Api(server), "org-1", full, Lab with { ParentLabId = "l1" })).Error);
    }

    [Fact]
    public async Task SaysWhenACodeIsTakenOrALabIsInUse()
    {
        var clash = new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, """{"code":"23505","message":"dup"}""") };
        Assert.Contains("already used", (await OrgAdmin.AddLabAsync(Api(clash), "org-1", Lab)).Error);
        Assert.Contains("already used", (await OrgAdmin.AddCenterAsync(Api(clash), "org-1", new CenterInput("l1", "C1", "Town", "", "", "", "", true))).Error);

        var used = new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, """{"code":"23503","message":"fk"}""") };
        Assert.Contains("untick Active", (await OrgAdmin.DeleteLabAsync(Api(used), "org-1", "l1")).Error);
        Assert.Contains("untick Active", (await OrgAdmin.DeleteCenterAsync(Api(used), "org-1", "c1")).Error);
        Assert.Contains("internet", (await OrgAdmin.DeleteLabAsync(Api(new OfflineServer()), "org-1", "l1")).Error);
    }

    [Fact]
    public async Task LoadsALabWithItsSettingsForEditing()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"l1","lab_code":"ML","name":"Main","type":"branch","parent_lab_id":"l0","address":null,"city":"Pune","state":null,"pincode":null,"phone":null,"email":null,"settings":{"abdm_enabled":true,"abdm_facility_id":"F","map_latitude":18.5,"map_longitude":73.8,"x":1},"is_active":false}]""") };
        var (lab, error) = await OrgAdmin.LoadLabAsync(Api(server), "org-1", "l1");
        Assert.Null(error);
        Assert.Equal(("ML", "branch", "l0", "Pune", false, true, "F", "18.5", "73.8"),
            (lab!.Input.Code, lab.Input.Type, lab.Input.ParentLabId, lab.Input.City, lab.Input.Active, lab.Input.AbdmEnabled, lab.Input.AbdmFacilityId, lab.Input.Latitude, lab.Input.Longitude));
        Assert.Equal(1, (int)lab.Settings["x"]!);
    }

    [Fact]
    public async Task AddsEditsAndLoadsACollectionCentre()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"lab_id":"l1","code":"TN","name":"Town","address":null,"contact_person":"Mr X","phone":null,"email":null,"is_active":true}]""") };
        Assert.True((await OrgAdmin.AddCenterAsync(Api(server), "org-1", new CenterInput("l1", " tn ", " Town ", "", "Mr X", "", "", true))).Ok);
        var body = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.Equal(("TN", "Town", "l1", "Mr X"), (body.GetProperty("code").GetString(), body.GetProperty("name").GetString(), body.GetProperty("lab_id").GetString(), body.GetProperty("contact_person").GetString()));

        Assert.True((await OrgAdmin.UpdateCenterAsync(Api(server), "org-1", "c1", new CenterInput("l1", "TN", "Town", "", "", "", "", false))).Ok);
        Assert.Contains("/rest/v1/collection_centers?id=eq.c1&organization_id=eq.org-1", server.Requests[1].Url);

        var (center, error) = await OrgAdmin.LoadCenterAsync(Api(server), "org-1", "c1");
        Assert.Null(error);
        Assert.Equal(new CenterInput("l1", "TN", "Town", "", "Mr X", "", "", true), center);

        var none = new FakeServer();
        Assert.Contains("required", (await OrgAdmin.AddCenterAsync(Api(none), "org-1", new CenterInput("", "TN", "Town", "", "", "", "", true))).Error);
        Assert.Empty(none.Requests);
    }
}
