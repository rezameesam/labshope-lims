using System.Net;
using System.Text.Json;
using LabShope.Core.Finance;
using LabShope.Core.Net;

namespace LabShope.Core.Tests;

public class BookkeepingTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "user-1", null) };

    private static readonly AccountInfo Cash = new("c", "1001", "Cash", "asset", null, true);
    private static readonly AccountInfo Rent = new("e", "5001", "Rent", "expense", null, true);

    [Fact]
    public void AQuickExpenseDebitsTheExpenseAndCreditsTheAccountPaidFrom()
    {
        var (description, lines, error) = Bookkeeping.Quick("expense", Cash, Rent, 1200m);

        Assert.Null(error);
        Assert.Equal("Expense - Rent - 1200", description);
        Assert.Equal([("e", 1200m, 0m), ("c", 0m, 1200m)], lines.Select(l => (l.AccountId, l.Debit, l.Credit)));
        Assert.Equal("Enter a valid amount.", Bookkeeping.Quick("expense", Cash, Rent, 0).Error);
        Assert.Equal("The two accounts must be different.", Bookkeeping.Quick("transfer", Cash, Cash, 5).Error);
        Assert.Equal("Select both accounts.", Bookkeeping.Quick("income", null, Cash, 5).Error);
    }

    [Fact]
    public void AnEntryNeedsADescriptionTwoLinesAndEqualDebitsAndCredits()
    {
        JournalDraftLine[] ok = [new("c", null, 100, 0), new("e", null, 0, 100)];
        Assert.Null(Bookkeeping.Validate("Rent", ok));
        Assert.Equal("A description is required.", Bookkeeping.Validate(" ", ok));
        Assert.Equal("At least two lines are needed.", Bookkeeping.Validate("x", [new("c", null, 100, 0)]));
        Assert.Equal("Debits and credits must be equal.", Bookkeeping.Validate("x", [new("c", null, 100, 0), new("e", null, 0, 90)]));
        Assert.Equal("A line is either a debit or a credit, not both.", Bookkeeping.Validate("x", [new("c", null, 100, 100), new("e", null, 0, 200)]));
    }

    [Fact]
    public async Task PostingTakesTheNextNumberAndSavesTheHeaderThenTheLines()
    {
        var server = new FakeServer { Handler = (r, _) => r.Method == HttpMethod.Get ? (HttpStatusCode.OK, """[{"entry_number":"JE-00007"}]""") : (HttpStatusCode.Created, "") };

        var result = await Bookkeeping.PostEntryAsync(Api(server), "org-1", new DateOnly(2026, 10, 31), " Rent ", "", [new("e", null, 1200, 0), new("c", " paid ", 0, 1200)]);

        Assert.True(result.Ok, result.Error);
        Assert.Equal("JE-00008", result.Detail);
        var header = JsonDocument.Parse(server.Requests[1].Body).RootElement;
        Assert.Equal(("JE-00008", "2026-10-31", "Rent", "posted", "user-1", "org-1"), (header.GetProperty("entry_number").GetString(), header.GetProperty("entry_date").GetString(),
            header.GetProperty("description").GetString(), header.GetProperty("status").GetString(), header.GetProperty("created_by").GetString(), header.GetProperty("organization_id").GetString()));
        Assert.Equal(JsonValueKind.Null, header.GetProperty("reference").ValueKind);
        var lines = JsonDocument.Parse(server.Requests[2].Body).RootElement.EnumerateArray().ToList();
        Assert.Equal(2, lines.Count);
        Assert.Equal(header.GetProperty("id").GetString(), lines[0].GetProperty("journal_entry_id").GetString());
        Assert.Equal("paid", lines[1].GetProperty("description").GetString());
    }

    [Fact]
    public async Task AFailedLinesInsertRemovesTheEntryAndNothingIsPostedForAnUnbalancedOne()
    {
        var server = new FakeServer { Handler = (r, _) =>
            r.Method == HttpMethod.Get ? (HttpStatusCode.OK, "[]")
            : r.RequestUri!.AbsolutePath.EndsWith("/journal_entry_lines") ? (HttpStatusCode.BadRequest, """{"message":"bad line"}""")
            : r.Method == HttpMethod.Delete ? (HttpStatusCode.OK, "[]") : (HttpStatusCode.Created, "") };

        var failed = await Bookkeeping.PostEntryAsync(Api(server), "org-1", new DateOnly(2026, 10, 31), "Rent", null, [new("e", null, 5, 0), new("c", null, 0, 5)]);
        Assert.False(failed.Ok);
        Assert.Contains(server.Requests, q => q.Method == HttpMethod.Delete && q.Url.Contains("/journal_entries"));
        Assert.Contains("JE-00001", server.Requests[1].Body); // first number when there are none yet

        var before = server.Requests.Count;
        var unbalanced = await Bookkeeping.PostEntryAsync(Api(server), "org-1", new DateOnly(2026, 10, 31), "Rent", null, [new("e", null, 5, 0), new("c", null, 0, 4)]);
        Assert.Equal("Debits and credits must be equal.", unbalanced.Error);
        Assert.Equal(before, server.Requests.Count);
    }

    [Fact]
    public async Task AccountsAreCreatedChangedAndSwitchedOffAndDuplicateCodesAreExplained()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        Assert.True((await Bookkeeping.SaveAccountAsync(Api(server), "org-1", null, " 1004 ", " Petty cash ", "asset", " ")).Ok);
        var row = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.Equal(("1004", "Petty cash", "asset"), (row.GetProperty("code").GetString(), row.GetProperty("name").GetString(), row.GetProperty("type").GetString()));

        Assert.Equal("Code and name are required.", (await Bookkeeping.SaveAccountAsync(Api(server), "org-1", null, "", "x", "asset", null)).Error);
        Assert.Equal("Choose what kind of account this is.", (await Bookkeeping.SaveAccountAsync(Api(server), "org-1", null, "1", "x", "bogus", null)).Error);

        var dup = new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, """{"code":"23505","message":"duplicate key"}""") };
        Assert.Equal("That code or number is already used.", (await Bookkeeping.SaveAccountAsync(Api(dup), "org-1", null, "1004", "x", "asset", null)).Error);

        var gone = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };
        Assert.False((await Bookkeeping.SetAccountActiveAsync(Api(gone), "org-1", "a1", false)).Ok);
        var fine = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"a1"}]""") };
        Assert.True((await Bookkeeping.SetAccountActiveAsync(Api(fine), "org-1", "a1", false)).Ok);
        Assert.Contains("\"is_active\":false", fine.Requests[0].Body);
    }
}
