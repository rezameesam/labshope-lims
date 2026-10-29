using System.Net;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class TeamTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    [Fact]
    public async Task ListsTheLabsStaffWithTheirStatus()
    {
        const string rows = """[{"id":"e1","employee_id":"E001","full_name":"Asha Rao","email":"asha@x.in","phone":"98","designation":"Technician","department":"Haematology","lab_id":"l1","is_active":true},{"id":"e2","employee_id":"E002","full_name":"Ravi Kumar","email":null,"phone":null,"designation":null,"department":null,"lab_id":null,"is_active":false}]""";
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, rows) };

        var result = await TeamService.LoadAsync(Api(server), "org-1");

        Assert.Null(result.Error);
        Assert.Equal(["Asha Rao", "Ravi Kumar"], result.Members.Select(m => m.FullName));
        Assert.Equal(["active", "inactive"], result.Members.Select(m => m.Status));
        Assert.Contains("organization_id=eq.org-1", server.Requests.Single().Url);
    }

    [Fact]
    public async Task ExplainsOfflineAndNotAllowed()
    {
        var offline = await TeamService.LoadAsync(Api(new OfflineServer()), "org-1");
        Assert.True(offline.Offline);
        Assert.Contains("internet", offline.Error);

        var denied = await TeamService.LoadAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") }), "org-1");
        Assert.Contains("isn't allowed", denied.Error);
    }
}
