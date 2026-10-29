using System.Net;
using LabShope.Core.Account;
using LabShope.Core.Net;

namespace LabShope.Core.Tests;

public class AccountServiceTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"labshope-acct-{Guid.NewGuid():N}");
    private string SettingsPath => Path.Combine(_dir, "account.json");

    private const string Token = """{"access_token":"a1","refresh_token":"r1","expires_in":3600,"user":{"id":"user-1","email":"a@b.c"}}""";

    private static string Orgs(params (string id, string slug, string name, string status)[] orgs) =>
        "[" + string.Join(",", orgs.Select(o => $$"""{"id":"{{o.id}}","slug":"{{o.slug}}","display_name":"{{o.name}}","status":"{{o.status}}"}""")) + "]";

    private static (HttpStatusCode, string) Route(HttpRequestMessage req, string[]? memberOf = null, bool goodPassword = true, string? orgsJson = null,
        string roles = """[{"role":"employee"}]""", string? employees = """[{"organization_id":"org-1","is_active":true,"two_factor_email_enabled":false}]""")
    {
        memberOf ??= ["org-1"];
        var path = req.RequestUri!.AbsolutePath;
        if (path.EndsWith("get_public_organization_context")) return (HttpStatusCode.OK, "null");
        if (path.EndsWith("/token")) return goodPassword ? (HttpStatusCode.OK, Token) : (HttpStatusCode.BadRequest, """{"error_code":"invalid_credentials","msg":"Invalid login credentials"}""");
        if (path.EndsWith("/user_roles")) return (HttpStatusCode.OK, roles);
        if (path.EndsWith("/employees")) return (HttpStatusCode.OK, employees ?? "[]");
        if (path.EndsWith("organization_users")) return (HttpStatusCode.OK, "[" + string.Join(",", memberOf.Select(o => $$"""{"organization_id":"{{o}}"}""")) + "]");
        if (path.EndsWith("/organizations"))
        {
            // Like the real server, only return the labs named in id=in.(...).
            var wanted = System.Text.RegularExpressions.Regex.Match(req.RequestUri.Query, @"id=in\.\(([^)]*)\)").Groups[1].Value.Split(',');
            var rows = System.Text.Json.JsonDocument.Parse(orgsJson ?? Orgs(("org-1", "demo", "Demo Lab", "active"))).RootElement.EnumerateArray()
                .Where(o => wanted.Contains(o.GetProperty("id").GetString())).Select(o => o.GetRawText());
            return (HttpStatusCode.OK, "[" + string.Join(",", rows) + "]");
        }
        if (path.EndsWith("/labs")) return (HttpStatusCode.OK, """[{"id":"lab-1"}]""");
        return (HttpStatusCode.NotFound, "{}");
    }

    private AccountService Service(HttpMessageHandler handler) =>
        new(new SupabaseApi(new HttpClient(handler), "https://x.supabase.co", "anon"), SettingsPath);

    [Fact]
    public async Task SignsInWithJustEmailAndPasswordAndFindsTheLab()
    {
        var result = await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync(" a@b.c ", "pw");

        Assert.True(result.Ok);
        Assert.Equal(("demo", "org-1", "Demo Lab", "lab-1"), (result.Workspace!.Slug, result.Workspace.OrganizationId, result.Workspace.OrganizationName, result.Workspace.LabId));
        Assert.Contains("employee", result.Workspace.Roles!);
        Assert.True(File.Exists(SettingsPath));
    }

    [Fact]
    public async Task OffersAChoiceWhenAnOwnerBelongsToSeveralLabs()
    {
        var two = Orgs(("org-1", "demo", "Demo Lab", "active"), ("org-2", "irm", "IRM", "trial"));
        var service = Service(new FakeServer { Handler = (r, _) => Route(r, memberOf: ["org-1", "org-2"], orgsJson: two, employees: "[]", roles: """[{"role":"admin"}]""") });

        var first = await service.SignInAsync("a@b.c", "pw");
        Assert.Null(first.Workspace);
        Assert.Equal(["Demo Lab", "IRM"], first.Choices!.Select(c => c.OrganizationName));

        var chosen = await service.ChooseAsync(first.Choices![1]);
        Assert.Equal("irm", chosen.Workspace!.Slug);
        Assert.Equal("lab-1", chosen.Workspace.LabId);
    }

    [Fact]
    public async Task IgnoresSuspendedLabs()
    {
        var suspended = Orgs(("org-1", "demo", "Demo Lab", "suspended"));
        var result = await Service(new FakeServer { Handler = (r, _) => Route(r, orgsJson: suspended) }).SignInAsync("a@b.c", "pw");
        Assert.Contains("isn't active", result.Error);
    }

    [Fact]
    public async Task RefusesAWrongPassword() =>
        Assert.Equal("Wrong email or password.", (await Service(new FakeServer { Handler = (r, _) => Route(r, goodPassword: false) }).SignInAsync("a@b.c", "bad")).Error);

    [Fact]
    public async Task ExplainsWhenTheAccountHasNoLabYet()
    {
        var result = await Service(new FakeServer { Handler = (r, _) => Route(r, memberOf: []) }).SignInAsync("a@b.c", "pw");
        Assert.Contains("isn't linked to a lab", result.Error);
        Assert.False(File.Exists(SettingsPath));
    }

    [Fact]
    public async Task EmployeesGoStraightToTheirOwnLabEvenIfTheyHaveOtherMemberships()
    {
        var two = Orgs(("org-1", "demo", "Demo Lab", "active"), ("org-2", "irm", "IRM", "active"));
        var result = await Service(new FakeServer { Handler = (r, _) => Route(r, memberOf: ["org-1", "org-2"], orgsJson: two) }).SignInAsync("a@b.c", "pw");
        Assert.Equal("org-1", result.Workspace!.OrganizationId);
    }

    [Fact]
    public async Task RefusesAnAccountWithoutAStaffRole() =>
        Assert.Contains("staff access", (await Service(new FakeServer { Handler = (r, _) => Route(r, roles: """[{"role":"patient"}]""") }).SignInAsync("a@b.c", "pw")).Error);

    [Fact]
    public async Task RefusesAnInactiveEmployee() =>
        Assert.Contains("inactive", (await Service(new FakeServer { Handler = (r, _) => Route(r, employees: """[{"organization_id":"org-1","is_active":false}]""") }).SignInAsync("a@b.c", "pw")).Error);

    [Fact]
    public async Task ExplainsWhenTwoStepVerificationIsOn() =>
        Assert.Contains("two-step", (await Service(new FakeServer { Handler = (r, _) => Route(r, employees: """[{"organization_id":"org-1","is_active":true,"two_factor_email_enabled":true}]""") }).SignInAsync("a@b.c", "pw")).Error);

    [Fact]
    public async Task OwnersWithoutAnEmployeeRecordUseTheirMemberships()
    {
        var result = await Service(new FakeServer { Handler = (r, _) => Route(r, employees: "[]", roles: """[{"role":"admin"}]""") }).SignInAsync("a@b.c", "pw");
        Assert.True(result.Workspace!.IsAdmin);
    }

    [Fact]
    public async Task ReportsNoInternet() =>
        Assert.Contains("Can't reach", (await Service(new OfflineServer()).SignInAsync("a@b.c", "pw")).Error);

    [Fact]
    public async Task RestoresTheSavedLoginWithoutAPassword()
    {
        await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync("a@b.c", "pw");

        var (workspace, online) = await Service(new FakeServer { Handler = (r, _) => Route(r) }).RestoreAsync();

        Assert.Equal("demo", workspace!.Slug);
        Assert.True(online);
    }

    [Fact]
    public async Task OpensOfflineFromTheSavedLogin()
    {
        await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync("a@b.c", "pw");

        var (workspace, online) = await Service(new OfflineServer()).RestoreAsync();

        Assert.Equal("demo", workspace!.Slug);
        Assert.False(online);
    }

    [Fact]
    public async Task EndsTheSessionWhenTheServerRejectsTheSavedLogin()
    {
        await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync("a@b.c", "pw");

        var rejecting = new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath.EndsWith("/token")
            ? (HttpStatusCode.BadRequest, """{"error_code":"refresh_token_not_found"}""") : Route(r) };
        var (workspace, _) = await Service(rejecting).RestoreAsync();

        Assert.Null(workspace);
    }

    [Fact]
    public async Task SignOutForgetsEverything()
    {
        var service = Service(new FakeServer { Handler = (r, _) => Route(r) });
        await service.SignInAsync("a@b.c", "pw");
        service.SignOut();
        Assert.Null((await service.RestoreAsync()).Workspace);
    }

    public void Dispose() { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); }
}
