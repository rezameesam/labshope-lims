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

public class SessionPersistenceTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"labshope-sess-{Guid.NewGuid():N}");
    private string SettingsPath => Path.Combine(_dir, "account.json");

    private static string Token(string refresh, int expiresIn) =>
        "{\"access_token\":\"a-" + refresh + "\",\"refresh_token\":\"" + refresh + "\",\"expires_in\":" + expiresIn + ",\"user\":{\"id\":\"user-1\",\"email\":\"a@b.c\"}}";

    private static (HttpStatusCode, string) Server(HttpRequestMessage req, ref int refreshes)
    {
        var path = req.RequestUri!.AbsolutePath;
        var query = req.RequestUri.Query;
        if (path.EndsWith("/token") && query.Contains("grant_type=password")) return (HttpStatusCode.OK, Token("refresh-1", 1)); // expires at once so the next call renews it
        if (path.EndsWith("/token") && query.Contains("grant_type=refresh_token")) return (HttpStatusCode.OK, Token($"refresh-{++refreshes + 1}", 3600));
        if (path.EndsWith("/user_roles")) return (HttpStatusCode.OK, """[{"role":"employee"}]""");
        if (path.EndsWith("/employees")) return (HttpStatusCode.OK, """[{"organization_id":"org-1","is_active":true,"two_factor_email_enabled":false}]""");
        if (path.EndsWith("/organization_users")) return (HttpStatusCode.OK, """[{"organization_id":"org-1"}]""");
        if (path.EndsWith("/organizations")) return (HttpStatusCode.OK, """[{"id":"org-1","slug":"demo","display_name":"Demo","status":"active"}]""");
        if (path.EndsWith("/labs")) return (HttpStatusCode.OK, """[{"id":"lab-1"}]""");
        return (HttpStatusCode.OK, "[]");
    }

    [Theory]
    [InlineData(400, """{"error_code":"email_not_confirmed","msg":"Email not confirmed"}""", "not been confirmed")]
    [InlineData(429, """{"error_code":"over_request_rate_limit","msg":"slow down"}""", "Too many attempts")]
    [InlineData(503, "{}", "server had a problem")]
    [InlineData(400, """{"error_code":"invalid_credentials","msg":"Invalid login credentials"}""", "Wrong email or password")]
    public async Task SignInSaysWhatActuallyWentWrong(int status, string body, string message)
    {
        var server = new FakeServer { Handler = (_, _) => ((HttpStatusCode)status, body) };
        var account = new AccountService(new SupabaseApi(new HttpClient(server), "https://x.supabase.co", "anon"), SettingsPath);
        Assert.Contains(message, (await account.SignInAsync("a@b.c", "pw")).Error);
    }

    [Fact]
    public async Task ForgotPasswordEmailsALinkToTheLabsOwnAddressForAKnownAccount()
    {
        var refreshes = 0;
        var server = new FakeServer();
        server.Handler = (req, _) => req.RequestUri!.AbsolutePath.EndsWith("/recover") ? (HttpStatusCode.OK, "{}") : Server(req, ref refreshes);
        var account = new AccountService(new SupabaseApi(new HttpClient(server), "https://x.supabase.co", "anon"), SettingsPath);
        Assert.True((await account.SignInAsync("a@b.c", "pw")).Ok); // the computer now knows this email's lab

        Assert.True((await account.ForgotPasswordAsync(" A@B.C ")).Ok);
        var request = server.Requests.Single(r => r.Url.Contains("/auth/v1/recover"));
        Assert.Contains(Uri.EscapeDataString("https://demo.labshope.com/staff/reset-password"), request.Url);
        Assert.Contains("A@B.C", request.Body);
    }

    [Fact]
    public async Task ForgotPasswordForAnUnknownEmailSendsNothingAndPointsToTheLabsWebsite()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "{}") };
        var account = new AccountService(new SupabaseApi(new HttpClient(server), "https://x.supabase.co", "anon"), SettingsPath);

        var result = await account.ForgotPasswordAsync("stranger@lab.com");
        Assert.False(result.Ok);
        Assert.Contains("lab's website", result.Error);
        Assert.Empty(server.Requests);
        Assert.False((await account.ForgotPasswordAsync("")).Ok);
    }

    [Fact]
    public async Task ARenewedLoginIsSavedSoTheNextStartStillWorks()
    {
        var refreshes = 0;
        var server = new FakeServer();
        server.Handler = (req, _) => Server(req, ref refreshes);
        var api = new SupabaseApi(new HttpClient(server), "https://x.supabase.co", "anon");
        var account = new AccountService(api, SettingsPath);
        Assert.True((await account.SignInAsync("a@b.c", "pw")).Ok);
        Assert.Contains(api.Session!.RefreshToken, File.ReadAllText(SettingsPath)); // what is saved is what the server currently honours

        // Later the app renews its login again while syncing (the token expired at once).
        var before = api.Session!.RefreshToken;
        api.Session = api.Session with { ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(5) }; // about to expire
        await api.SelectAsync("patients", "select=id");

        Assert.NotEqual(before, api.Session!.RefreshToken);                           // it really was renewed...
        Assert.Contains(api.Session.RefreshToken, File.ReadAllText(SettingsPath));    // ...and the newest one is on disk
        Assert.DoesNotContain("\"" + before + "\"", File.ReadAllText(SettingsPath));  // the stale one is gone
    }

    public void Dispose() { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); }
}
