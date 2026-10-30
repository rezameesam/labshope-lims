using System.Net;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class ResultHistoryTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    [Fact]
    public async Task ListsChangesNewestFirstWithStaffNamesAndPlainSummaries()
    {
        var audit = """[{"action":"result_updated","changed_by":"u1","changed_at":"2026-10-30T10:00:00Z","old_values":{"result":"12","status":"completed"},"new_values":{"result":"14","status":"completed"}},{"action":"status_changed","changed_by":null,"changed_at":"2026-10-30T09:00:00Z","old_values":{"status":"pending"},"new_values":{"status":"in_progress"}}]""";
        var server = new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath.EndsWith("/employees")
            ? (HttpStatusCode.OK, """[{"user_id":"u1","full_name":"Nadia Khan"}]""") : (HttpStatusCode.OK, audit) };

        var (entries, error) = await ResultHistory.LoadAsync(Api(server), "org-1", "t1");

        Assert.Null(error);
        Assert.Contains("patient_test_id=eq.t1", server.Requests[0].Url);
        Assert.Contains("order=changed_at.desc", server.Requests[0].Url);
        Assert.Equal(("Nadia Khan", "Result changed from 12 to 14"), (entries[0].ChangedBy, entries[0].Summary));
        Assert.Equal((null, "Status changed from pending to in_progress"), (entries[1].ChangedBy, entries[1].Summary));
        Assert.Equal("result updated", entries[0].What);
    }

    [Fact]
    public async Task OfflineAndForbiddenGiveReadableMessages()
    {
        var offline = new FakeServer { Handler = (_, _) => throw new HttpRequestException("down") };
        Assert.Equal("The history needs an internet connection.", (await ResultHistory.LoadAsync(Api(offline), "o", "t")).Error);
        var denied = new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") };
        Assert.Contains("isn't allowed", (await ResultHistory.LoadAsync(Api(denied), "o", "t")).Error);
    }
}
