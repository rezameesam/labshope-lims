using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class StaffEditTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    [Fact]
    public async Task EditsNamePhoneDesignationAndDepartmentForThatPersonOnly()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"e1"}]""") };
        var result = await TeamService.UpdateAsync(Api(server), "org-1", "e1", new TeamService.StaffEdit(" Asha Rao ", "", "Technician", " Lab "));
        Assert.True(result.Ok, result.Error);
        var call = server.Requests.Single();
        Assert.Equal("PATCH", call.Method.Method);
        Assert.Contains("/rest/v1/employees?id=eq.e1&organization_id=eq.org-1", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("Asha Rao", "Technician", "Lab"), (body.GetProperty("full_name").GetString(), body.GetProperty("designation").GetString(), body.GetProperty("department").GetString()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("phone").ValueKind);
    }

    [Fact]
    public async Task RefusesANamelessEditAndReportsRefusalOrOffline()
    {
        var none = new FakeServer();
        Assert.Contains("name", (await TeamService.UpdateAsync(Api(none), "org-1", "e1", new TeamService.StaffEdit(" ", "", "", ""))).Error);
        Assert.Empty(none.Requests);
        var refused = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };
        Assert.False((await TeamService.UpdateAsync(Api(refused), "org-1", "e1", new TeamService.StaffEdit("A", "", "", ""))).Ok);
        Assert.Contains("internet", (await TeamService.UpdateAsync(Api(new OfflineServer()), "org-1", "e1", new TeamService.StaffEdit("A", "", "", ""))).Error);
    }

    [Fact]
    public async Task ATemporaryPasswordComesBackOnceFromTheWebsitesFunction()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"success":true,"temp_password":"Abc123xyz789"}""") };
        var result = await TeamService.ResetPasswordAsync(Api(server), "e1", TeamService.ResetMode.Temporary, null, "https://demo.labshope.com/staff/reset-password");
        Assert.True(result.Ok, result.Error);
        Assert.Equal("Abc123xyz789", result.TempPassword);
        var call = server.Requests.Single();
        Assert.EndsWith("/functions/v1/employee-admin-reset-password", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("e1", "temp", "https://demo.labshope.com/staff/reset-password"), (body.GetProperty("employee_id").GetString(), body.GetProperty("mode").GetString(), body.GetProperty("reset_base_url").GetString()));
    }

    [Fact]
    public async Task ACustomPasswordNeedsSixCharactersAndIsSentAsSet()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"success":true}""") };
        Assert.Contains("6 characters", (await TeamService.ResetPasswordAsync(Api(server), "e1", TeamService.ResetMode.Custom, "12345", "https://x")).Error);
        Assert.Empty(server.Requests);

        Assert.True((await TeamService.ResetPasswordAsync(Api(server), "e1", TeamService.ResetMode.Custom, "123456", "https://x")).Ok);
        var body = JsonDocument.Parse(server.Requests.Single().Body).RootElement;
        Assert.Equal(("set", "123456"), (body.GetProperty("mode").GetString(), body.GetProperty("custom_password").GetString()));
    }

    [Fact]
    public async Task AResetLinkIsRequestedByEmailAndFunctionErrorsAreShownInPlainWords()
    {
        var ok = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"success":true}""") };
        Assert.True((await TeamService.ResetPasswordAsync(Api(ok), "e1", TeamService.ResetMode.Email, null, "https://x")).Ok);
        Assert.Equal("email", JsonDocument.Parse(ok.Requests.Single().Body).RootElement.GetProperty("mode").GetString());

        var inactive = new FakeServer { Handler = (_, _) => (HttpStatusCode.BadRequest, """{"error":"Cannot reset password for an inactive employee."}""") };
        Assert.Equal("Cannot reset password for an inactive employee.", (await TeamService.ResetPasswordAsync(Api(inactive), "e1", TeamService.ResetMode.Email, null, "https://x")).Error);
        var denied = new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, """{"error":"Only organization admins"}""") };
        Assert.Contains("Only an admin", (await TeamService.ResetPasswordAsync(Api(denied), "e1", TeamService.ResetMode.Email, null, "https://x")).Error);
        Assert.Contains("internet", (await TeamService.ResetPasswordAsync(Api(new OfflineServer()), "e1", TeamService.ResetMode.Email, null, "https://x")).Error);
        var noTemp = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"success":true}""") };
        Assert.Contains("did not return", (await TeamService.ResetPasswordAsync(Api(noTemp), "e1", TeamService.ResetMode.Temporary, null, "https://x")).Error);
    }
}
