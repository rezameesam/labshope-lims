using System.Net;
using LabShope.Core.Finance;
using LabShope.Core.Net;

namespace LabShope.Core.Tests;

public class FinanceTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    // Books for one bill of 750 with two payments, exactly as the server posts them.
    private static (HttpStatusCode, string) Books(HttpRequestMessage req)
    {
        var path = req.RequestUri!.AbsolutePath;
        if (path.EndsWith("/accounts")) return (HttpStatusCode.OK, """[{"id":"a-cash","code":"1001","name":"Cash","type":"asset"},{"id":"a-ar","code":"1003","name":"Accounts Receivable","type":"asset"},{"id":"a-rev","code":"4001","name":"Test Revenue","type":"revenue"},{"id":"a-unused","code":"5001","name":"Rent","type":"expense"}]""");
        if (path.EndsWith("/journal_entries")) return (HttpStatusCode.OK, """[{"id":"e3","entry_number":"AUTO-00003","entry_date":"2026-10-29","description":"Payment - INV1","reference":"UPI1"},{"id":"e2","entry_number":"AUTO-00002","entry_date":"2026-10-29","description":"Payment - INV1","reference":null},{"id":"e1","entry_number":"AUTO-00001","entry_date":"2026-10-29","description":"Invoice INV1","reference":"INV1"}]""");
        if (path.EndsWith("/journal_entry_lines")) return (HttpStatusCode.OK, """
            [{"journal_entry_id":"e1","account_id":"a-ar","debit":750,"credit":0},{"journal_entry_id":"e1","account_id":"a-rev","debit":0,"credit":750},
             {"journal_entry_id":"e2","account_id":"a-cash","debit":300,"credit":0},{"journal_entry_id":"e2","account_id":"a-ar","debit":0,"credit":300},
             {"journal_entry_id":"e3","account_id":"a-cash","debit":450,"credit":0},{"journal_entry_id":"e3","account_id":"a-ar","debit":0,"credit":450}]
            """);
        return (HttpStatusCode.NotFound, "{}");
    }

    [Fact]
    public async Task BuildsATrialBalanceThatTalliesAndSkipsAccountsWithNoActivity()
    {
        var result = await FinanceService.LoadAsync(Api(new FakeServer { Handler = (r, _) => Books(r) }), "org-1", new DateOnly(2026, 4, 1), new DateOnly(2027, 3, 31));

        var tb = result.Data!;
        Assert.True(tb.Tallied);
        Assert.Equal((1500m, 1500m, 3), (tb.TotalDebit, tb.TotalCredit, tb.EntryCount));
        Assert.Equal(["1001", "1003", "4001"], tb.Accounts.Select(a => a.Code)); // Rent had nothing posted: left out
        var cash = tb.Accounts.Single(a => a.Code == "1001");
        Assert.Equal((750m, 0m, 750m, 0m), (cash.TotalDebit, cash.TotalCredit, cash.ClosingDebit, cash.ClosingCredit));
        var receivable = tb.Accounts.Single(a => a.Code == "1003");
        Assert.Equal(0m, receivable.Net); // fully paid: nothing left to collect
        Assert.Equal(750m, tb.Accounts.Single(a => a.Code == "4001").ClosingCredit);
    }

    [Fact]
    public async Task ListsRecentEntriesNewestFirstWithTheirAmounts()
    {
        var tb = (await FinanceService.LoadAsync(Api(new FakeServer { Handler = (r, _) => Books(r) }), "org-1", new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 31))).Data!;
        Assert.Equal(["AUTO-00003", "AUTO-00002", "AUTO-00001"], tb.RecentEntries.Select(e => e.EntryNumber));
        Assert.Equal([450m, 300m, 750m], tb.RecentEntries.Select(e => e.Amount));
    }

    [Fact]
    public async Task AskesTheServerForPostedEntriesInThePeriodForThisLabOnly()
    {
        var server = new FakeServer { Handler = (r, _) => Books(r) };
        await FinanceService.LoadAsync(Api(server), "org-1", new DateOnly(2026, 4, 1), new DateOnly(2027, 3, 31));

        var entries = server.Requests.Single(r => r.Url.Contains("/journal_entries")).Url;
        Assert.Contains("organization_id=eq.org-1", entries);
        Assert.Contains("status=eq.posted", entries);
        Assert.Contains("entry_date=gte.2026-04-01", entries);
        Assert.Contains("entry_date=lte.2027-03-31", entries);
    }

    [Fact]
    public async Task FetchesLinesInChunksSoTheAddressNeverGetsTooLong()
    {
        var ids = string.Join(",", Enumerable.Range(1, 230).Select(i => $"{{\"id\":\"e{i}\",\"entry_number\":\"N{i}\",\"entry_date\":\"2026-10-29\",\"description\":\"d\",\"reference\":null}}"));
        var server = new FakeServer { Handler = (r, _) =>
            r.RequestUri!.AbsolutePath.EndsWith("/journal_entries") ? (HttpStatusCode.OK, "[" + ids + "]")
            : r.RequestUri.AbsolutePath.EndsWith("/accounts") ? (HttpStatusCode.OK, "[]") : (HttpStatusCode.OK, "[]") };

        await FinanceService.LoadAsync(Api(server), "org-1", new DateOnly(2026, 4, 1), new DateOnly(2027, 3, 31));

        Assert.Equal(3, server.Requests.Count(r => r.Url.Contains("/journal_entry_lines"))); // 100 + 100 + 30
    }

    [Fact]
    public async Task ExplainsWhenOfflineOrNotAllowed()
    {
        var offline = await FinanceService.LoadAsync(Api(new OfflineServer()), "org-1", new DateOnly(2026, 4, 1), new DateOnly(2027, 3, 31));
        Assert.True(offline.Offline);
        Assert.Contains("internet", offline.Error);

        var denied = await FinanceService.LoadAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, """{"message":"no"}""") }), "org-1", new DateOnly(2026, 4, 1), new DateOnly(2027, 3, 31));
        Assert.False(denied.Offline);
        Assert.Contains("isn't allowed", denied.Error);
    }

    [Theory]
    [InlineData(2026, 10, 29, 2026, 4, 1, 2027, 3, 31)]
    [InlineData(2027, 2, 15, 2026, 4, 1, 2027, 3, 31)]
    [InlineData(2026, 4, 1, 2026, 4, 1, 2027, 3, 31)]
    [InlineData(2026, 3, 31, 2025, 4, 1, 2026, 3, 31)]
    public void TheFinancialYearRunsAprilToMarch(int y, int m, int d, int sy, int sm, int sd, int ey, int em, int ed)
    {
        var (start, end) = FinanceService.FinancialYear(new DateOnly(y, m, d));
        Assert.Equal((new DateOnly(sy, sm, sd), new DateOnly(ey, em, ed)), (start, end));
    }
}
