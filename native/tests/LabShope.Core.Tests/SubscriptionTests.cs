using System.Net;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class SubscriptionTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private static readonly DateTimeOffset Now = new(2026, 10, 29, 12, 0, 0, TimeSpan.Zero);
    public SubscriptionTests() => _store = new LocalStore(_path);

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static SubscriptionInfo Trial(int daysLeft) => new("trial", "starter", Now.AddDays(daysLeft), null, false, null);

    [Theory]
    [InlineData(30, NoticeLevel.Info, "runs until")]
    [InlineData(10, NoticeLevel.Warning, "ends in 10 days")]
    [InlineData(3, NoticeLevel.Danger, "in 3 days")]
    [InlineData(1, NoticeLevel.Danger, "tomorrow")]
    [InlineData(-2, NoticeLevel.Danger, "has ended")]
    public void ATrialCountsDownAndGetsUrgent(int daysLeft, NoticeLevel level, string text)
    {
        var notice = SubscriptionService.Notice(Trial(daysLeft), Now)!;
        Assert.Equal(level, notice.Level);
        Assert.Contains(text, notice.Text);
    }

    [Fact]
    public void ASuspendedLabIsToldPlainly()
    {
        var notice = SubscriptionService.Notice(new("suspended", "starter", null, null, false, null), Now)!;
        Assert.Equal(NoticeLevel.Danger, notice.Level);
        Assert.Contains("not active", notice.Text);
    }

    [Fact]
    public void APaidLabHearsNothingUntilRenewalIsNear()
    {
        Assert.Null(SubscriptionService.Notice(new("active", "growth", null, Now.AddDays(200), false, null), Now));
        Assert.Contains("ends in 9 days", SubscriptionService.Notice(new("active", "growth", null, Now.AddDays(9), false, null), Now)!.Text);
        Assert.Null(SubscriptionService.Notice(null, Now)); // nothing known yet
    }

    [Fact]
    public void ALabWithFreeAccessIsOnlyToldWhenItIsAboutToEnd()
    {
        Assert.Null(SubscriptionService.Notice(new("active", "premium", null, null, true, null), Now));
        Assert.Null(SubscriptionService.Notice(new("active", "premium", null, null, true, Now.AddDays(100)), Now));
        Assert.Contains("complimentary access ends in 5 days", SubscriptionService.Notice(new("active", "premium", null, null, true, Now.AddDays(5)), Now)!.Text);
    }

    [Fact]
    public async Task IsReadFromTheServerCachedForOfflineAndRefreshedAtMostEverySixHours()
    {
        const string row = """[{"status":"trial","plan_code":"starter","trial_ends_at":"2026-11-05T00:00:00+00:00","plan_expires_at":null,"is_complimentary":false,"complimentary_until":null}]""";
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, row) };

        Assert.True(await SubscriptionService.RefreshAsync(Api(server), _store, "org-1"));
        var cached = SubscriptionService.Cached(_store)!;
        Assert.Equal(("trial", "starter"), (cached.Status, cached.PlanCode));
        Assert.Equal(new DateTimeOffset(2026, 11, 5, 0, 0, 0, TimeSpan.Zero), cached.TrialEndsAt);

        Assert.False(await SubscriptionService.RefreshAsync(Api(server), _store, "org-1")); // too soon: skipped
        Assert.Equal(1, server.Requests.Count);
        Assert.NotNull(SubscriptionService.Cached(_store)); // still there with no connection
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
