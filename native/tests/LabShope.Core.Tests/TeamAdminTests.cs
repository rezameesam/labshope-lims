using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class TeamAdminTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static TeamService.NewStaff Staff(string name = "Asha Rao", string email = "asha@lab.com", string password = "longenough1", string role = "employee") =>
        new(name, email, password, role, " 9876543210 ", "", "Front desk", "lab-1");

    [Fact]
    public async Task CreatesTheAccountThroughTheWebsitesFunctionForThisLab()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"user_id":"u1","employee_row_id":"e1"}""") };

        var result = await TeamService.AddAsync(Api(server), "org-1", Staff());

        Assert.True(result.Ok);
        var call = server.Requests.Single();
        Assert.Contains("/functions/v1/create-employee", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("asha@lab.com", "Asha Rao", "employee", "org-1", "lab-1", "9876543210", "Front desk"),
            (body.GetProperty("email").GetString(), body.GetProperty("full_name").GetString(), body.GetProperty("role").GetString(),
             body.GetProperty("organization_id").GetString(), body.GetProperty("lab_id").GetString(), body.GetProperty("phone").GetString(), body.GetProperty("department").GetString()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("designation").ValueKind);
    }

    [Theory]
    [InlineData("", "a@b.co", "longenough1", "employee", "name")]
    [InlineData("A", "nope", "longenough1", "employee", "email")]
    [InlineData("A", "a@b.co", "short", "employee", "8 characters")]
    [InlineData("A", "a@b.co", "longenough1", "owner", "role")]
    public async Task ChecksTheFormBeforeSendingAnything(string name, string email, string password, string role, string message)
    {
        var server = new FakeServer();
        var result = await TeamService.AddAsync(Api(server), "org-1", Staff(name, email, password, role));
        Assert.False(result.Ok);
        Assert.Contains(message, result.Error);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task ExplainsWhyAccountCreationFailed()
    {
        Assert.Contains("internet", (await TeamService.AddAsync(Api(new OfflineServer()), "o", Staff())).Error);
        Assert.Contains("Only an admin", (await TeamService.AddAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, """{"error":"Only admins can create employees"}""") }), "o", Staff())).Error);
        var taken = await TeamService.AddAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.BadRequest, """{"error":"A user with this email address has already been registered"}""") }), "o", Staff());
        Assert.Contains("already been registered", taken.Error);
    }

    [Fact]
    public async Task SwitchesAPersonOffForThisLabOnly()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"e1"}]""") };
        Assert.True((await TeamService.SetActiveAsync(Api(server), "org-1", "e1", false)).Ok);
        var call = server.Requests.Single();
        Assert.Equal("PATCH", call.Method.Method);
        Assert.Contains("/rest/v1/employees?id=eq.e1&organization_id=eq.org-1", call.Url);
        Assert.False(JsonDocument.Parse(call.Body).RootElement.GetProperty("is_active").GetBoolean());
    }

    [Fact]
    public async Task ASilentlyRefusedChangeIsReportedNotIgnored()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") }; // row level security hides the row: nothing changed
        var result = await TeamService.SetActiveAsync(Api(server), "org-1", "e1", true);
        Assert.False(result.Ok);
        Assert.Contains("isn't allowed", result.Error);
    }
}
