using System.Net;
using LabShope.Core.Account;
using LabShope.Core.Net;

namespace LabShope.Core.Tests;

public class AccountServiceTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"labshope-acct-{Guid.NewGuid():N}");
    private string SettingsPath => Path.Combine(_dir, "account.json");

    private const string Org = """{"organization":{"id":"org-1","slug":"demo","display_name":"Demo Lab"},"primary_lab":{"id":"lab-1"}}""";
    private const string Token = """{"access_token":"a1","refresh_token":"r1","expires_in":3600,"user":{"id":"user-1","email":"a@b.c"}}""";

    private static (HttpStatusCode, string) Route(HttpRequestMessage req, bool member = true, bool goodPassword = true, bool orgExists = true)
    {
        var path = req.RequestUri!.AbsolutePath;
        if (path.EndsWith("get_public_organization_context")) return (HttpStatusCode.OK, orgExists ? Org : "null");
        if (path.EndsWith("/token")) return goodPassword ? (HttpStatusCode.OK, Token) : (HttpStatusCode.BadRequest, """{"error_code":"invalid_credentials","msg":"Invalid login credentials"}""");
        if (path.EndsWith("organization_users")) return (HttpStatusCode.OK, member ? """[{"user_id":"user-1"}]""" : "[]");
        return (HttpStatusCode.NotFound, "{}");
    }

    private AccountService Service(HttpMessageHandler handler) =>
        new(new SupabaseApi(new HttpClient(handler), "https://x.supabase.co", "anon"), SettingsPath);

    [Fact]
    public async Task SignsInToTheNamedLabAndRemembersIt()
    {
        var result = await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync("  Demo ", "a@b.c", "pw");

        Assert.True(result.Ok);
        Assert.Equal(new Workspace("demo", "org-1", "Demo Lab", "lab-1"), result.Workspace);
        Assert.True(File.Exists(SettingsPath));
    }

    [Fact]
    public async Task RefusesAWrongPassword() =>
        Assert.Equal("Wrong email or password.", (await Service(new FakeServer { Handler = (r, _) => Route(r, goodPassword: false) }).SignInAsync("demo", "a@b.c", "bad")).Error);

    [Fact]
    public async Task RefusesSomeoneWhoDoesNotBelongToTheLab()
    {
        var result = await Service(new FakeServer { Handler = (r, _) => Route(r, member: false) }).SignInAsync("demo", "a@b.c", "pw");
        Assert.Equal("This account doesn't have access to that lab.", result.Error);
        Assert.False(File.Exists(SettingsPath));
    }

    [Fact]
    public async Task ReportsAnUnknownLab() =>
        Assert.Contains("No active lab", (await Service(new FakeServer { Handler = (r, _) => Route(r, orgExists: false) }).SignInAsync("nope", "a@b.c", "pw")).Error);

    [Fact]
    public async Task ReportsNoInternet() =>
        Assert.Contains("Can't reach", (await Service(new OfflineServer()).SignInAsync("demo", "a@b.c", "pw")).Error);

    [Fact]
    public async Task RestoresTheSavedLoginWithoutAPassword()
    {
        await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync("demo", "a@b.c", "pw");

        var (workspace, online) = await Service(new FakeServer { Handler = (r, _) => Route(r) }).RestoreAsync();

        Assert.Equal("demo", workspace!.Slug);
        Assert.True(online);
    }

    [Fact]
    public async Task OpensOfflineFromTheSavedLogin()
    {
        await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync("demo", "a@b.c", "pw");

        var (workspace, online) = await Service(new OfflineServer()).RestoreAsync();

        Assert.Equal("demo", workspace!.Slug);
        Assert.False(online);
    }

    [Fact]
    public async Task EndsTheSessionWhenTheServerRejectsTheSavedLogin()
    {
        await Service(new FakeServer { Handler = (r, _) => Route(r) }).SignInAsync("demo", "a@b.c", "pw");

        var rejecting = new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath.EndsWith("/token")
            ? (HttpStatusCode.BadRequest, """{"error_code":"refresh_token_not_found"}""") : Route(r) };
        var (workspace, _) = await Service(rejecting).RestoreAsync();

        Assert.Null(workspace);
    }

    [Fact]
    public async Task SignOutForgetsEverything()
    {
        var service = Service(new FakeServer { Handler = (r, _) => Route(r) });
        await service.SignInAsync("demo", "a@b.c", "pw");
        service.SignOut();
        Assert.Null((await service.RestoreAsync()).Workspace);
    }

    public void Dispose() { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); }
}
