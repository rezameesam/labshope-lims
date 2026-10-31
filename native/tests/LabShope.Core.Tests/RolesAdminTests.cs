using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class RolesAdminTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly Guid NewId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task ListsRolesWithPermissionAndStaffCounts()
    {
        var server = new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath switch
        {
            var p when p.EndsWith("/custom_roles") => (HttpStatusCode.OK, """[{"id":"r1","name":"Collector","description":"Front desk","is_active":true,"is_system_role":false},{"id":"r2","name":"Admin","description":null,"is_active":true,"is_system_role":true}]"""),
            var p when p.EndsWith("/role_permissions") => (HttpStatusCode.OK, """[{"role_id":"r1"},{"role_id":"r1"},{"role_id":"r2"}]"""),
            _ => (HttpStatusCode.OK, """[{"role_id":"r1"}]"""),
        } };

        var (roles, error) = await RolesAdmin.LoadAsync(Api(server), "org-1");

        Assert.Null(error);
        Assert.Equal([("Collector", 2, 1, "Active"), ("Admin", 1, 0, "System")], roles.Select(r => (r.Name, r.Permissions, r.Users, r.StateText)));
        Assert.Contains("organization_id=eq.org-1", server.Requests[0].Url);
    }

    [Fact]
    public async Task CreatingARoleInsertsItWithItsPermissionsAndIgnoresUnknownOnes()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        var result = await RolesAdmin.SaveAsync(Api(server), "org-1", null, " Collector ", " ", true, new HashSet<string> { "view_patients", "create_patients", "hack_the_planet" }, () => NewId);

        Assert.True(result.Ok, result.Error);
        var role = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.Equal((NewId.ToString(), "Collector", "org-1"), (role.GetProperty("id").GetString(), role.GetProperty("name").GetString(), role.GetProperty("organization_id").GetString()));
        Assert.Equal(JsonValueKind.Null, role.GetProperty("description").ValueKind);
        var perms = JsonDocument.Parse(server.Requests[1].Body).RootElement.EnumerateArray().Select(p => p.GetProperty("permission").GetString()).Order().ToList();
        Assert.Equal(["create_patients", "view_patients"], perms);
    }

    [Fact]
    public async Task ChangingARoleRemovesAndAddsOnlyWhatDiffers()
    {
        var server = new FakeServer { Handler = (r, _) =>
            r.Method == HttpMethod.Get ? (HttpStatusCode.OK, """[{"permission":"view_patients"},{"permission":"edit_patients"}]""")
            : r.Method == HttpMethod.Post ? (HttpStatusCode.Created, "") : (HttpStatusCode.OK, """[{"id":"r1"}]""") };

        var result = await RolesAdmin.SaveAsync(Api(server), "org-1", "r1", "Collector", "x", true, new HashSet<string> { "view_patients", "create_patients" });

        Assert.True(result.Ok, result.Error);
        var delete = server.Requests.Single(r => r.Method == HttpMethod.Delete);
        Assert.Contains("role_id=eq.r1", delete.Url);
        Assert.Contains("permission=in.(edit_patients)", delete.Url);
        var post = server.Requests.Single(r => r.Method == HttpMethod.Post);
        Assert.Contains("create_patients", post.Body);
        Assert.DoesNotContain("view_patients", post.Body);
    }

    [Fact]
    public async Task ValidationSystemRolesAndEmptyMatchesAreRefused()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };
        var api = Api(server);
        Assert.Equal("Give the role a name.", (await RolesAdmin.SaveAsync(api, "o", null, " ", null, true, new HashSet<string>())).Error);
        Assert.Equal("System roles cannot be deleted.", (await RolesAdmin.DeleteAsync(api, "o", new RoleRow("r2", "Admin", null, true, true, 0, 0))).Error);
        Assert.Empty(server.Requests);
        Assert.False((await RolesAdmin.DeleteAsync(api, "o", new RoleRow("r1", "Collector", null, true, false, 0, 0))).Ok); // matched nothing
        Assert.False((await RolesAdmin.SaveAsync(api, "o", "r1", "X", null, true, new HashSet<string>())).Ok);
    }

    [Fact]
    public void PermissionLabelsReadLikeTheWebsite()
    {
        Assert.Equal("Enter Test Results", RolesAdmin.Label("enter_test_results"));
        Assert.Equal(12, RolesAdmin.Groups.Count);
    }

    [Fact]
    public void AnInventoryItemIsFoundByItsBarcodeIgnoringCaseAndSpaces()
    {
        InventoryItem Item(string name, string? sku) => new("i-" + name, name, "reagent", sku, "box", 5, 2, 10, null, null);
        var items = new[] { Item("EDTA tubes", "EDTA-100"), Item("Gloves", null), Item("Strips", " ab12 ") };

        Assert.Equal("EDTA tubes", InventoryService.FindByBarcode(items, " edta-100 ")!.Name);
        Assert.Equal("Strips", InventoryService.FindByBarcode(items, "AB12")!.Name);
        Assert.Null(InventoryService.FindByBarcode(items, "nope"));
        Assert.Null(InventoryService.FindByBarcode(items, "  "));
    }
}
