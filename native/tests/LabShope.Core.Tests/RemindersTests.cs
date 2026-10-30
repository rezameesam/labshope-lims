using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class RemindersTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly DateOnly Today = new(2026, 10, 31);

    [Fact]
    public async Task ListsTheOrganizationsRemindersOldestFirst()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"r1","patient_id":"p1","reminder_type":"follow_up","title":"Call back","message":null,"reminder_date":"2026-10-30","due_date":null,"is_completed":false},{"id":"r2","patient_id":"p2","reminder_type":"payment","title":"Dues","message":"Pay","reminder_date":"2026-11-02","due_date":"2026-11-05","is_completed":true}]""") };
        var (items, error) = await Reminders.LoadAsync(Api(server), "org-1");

        Assert.Null(error);
        Assert.Equal(["r1", "r2"], items.Select(i => i.Id));
        Assert.Contains("organization_id=eq.org-1", server.Requests[0].Url);
        Assert.Contains("order=reminder_date.asc", server.Requests[0].Url);
        Assert.True(items[0].IsOverdue(Today));
        Assert.False(items[1].IsOverdue(Today)); // done
        Assert.Equal("follow up", items[0].TypeText);
    }

    [Fact]
    public async Task RefusesToSaveWithoutAPatientATitleOrAValidDate()
    {
        var server = new FakeServer();
        var api = Api(server);
        Assert.Equal("Choose a patient.", (await Reminders.SaveAsync(api, "o", null, "", "custom", "x", "", "2026-11-01", null)).Error);
        Assert.Equal("Give the reminder a title.", (await Reminders.SaveAsync(api, "o", null, "p1", "custom", "  ", "", "2026-11-01", null)).Error);
        Assert.Equal("Enter the reminder date.", (await Reminders.SaveAsync(api, "o", null, "p1", "custom", "x", "", "soon", null)).Error);
        Assert.Equal("The due date isn't a valid date.", (await Reminders.SaveAsync(api, "o", null, "p1", "custom", "x", "", "2026-11-01", "later")).Error);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task AddsANewReminderAndPatchesAnExistingOne()
    {
        var server = new FakeServer { Handler = (r, _) => r.Method == HttpMethod.Post ? (HttpStatusCode.Created, "") : (HttpStatusCode.OK, """[{"id":"r1"}]""") };
        var api = Api(server);

        Assert.True((await Reminders.SaveAsync(api, "org-1", null, "p1", "checkup", " Annual ", " note ", "2026-11-01", "")).Ok);
        var body = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.Equal(("p1", "org-1", "checkup", "Annual", "note", "2026-11-01"), (body.GetProperty("patient_id").GetString(), body.GetProperty("organization_id").GetString(),
            body.GetProperty("reminder_type").GetString(), body.GetProperty("title").GetString(), body.GetProperty("message").GetString(), body.GetProperty("reminder_date").GetString()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("due_date").ValueKind);
        Assert.Equal("none", body.GetProperty("notification_method").GetString());

        Assert.True((await Reminders.SaveAsync(api, "org-1", "r1", "p1", "weird", "T", "", "2026-11-01", null)).Ok);
        Assert.Equal("PATCH", server.Requests[1].Method.Method);
        Assert.Contains("id=eq.r1&organization_id=eq.org-1", server.Requests[1].Url);
        Assert.Equal("custom", JsonDocument.Parse(server.Requests[1].Body).RootElement.GetProperty("reminder_type").GetString());
    }

    [Fact]
    public async Task MarkingDoneStampsTheTimeAndUndoingClearsIt()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"r1"}]""") };
        var api = Api(server);
        var now = new DateTimeOffset(2026, 10, 31, 9, 0, 0, TimeSpan.Zero);

        Assert.True((await Reminders.SetDoneAsync(api, "o", "r1", true, now)).Ok);
        var done = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.True(done.GetProperty("is_completed").GetBoolean());
        Assert.StartsWith("2026-10-31T09:00:00", done.GetProperty("completed_at").GetString());

        await Reminders.SetDoneAsync(api, "o", "r1", false, now);
        var undone = JsonDocument.Parse(server.Requests[1].Body).RootElement;
        Assert.False(undone.GetProperty("is_completed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, undone.GetProperty("completed_at").ValueKind);
    }

    [Fact]
    public async Task ADeleteOrTickThatMatchedNothingIsAFailureAndOfflineSaysSo()
    {
        var gone = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };
        Assert.False((await Reminders.DeleteAsync(Api(gone), "o", "r1")).Ok);
        Assert.False((await Reminders.SetDoneAsync(Api(gone), "o", "r1", true, DateTimeOffset.UtcNow)).Ok);

        var offline = new FakeServer { Handler = (_, _) => throw new HttpRequestException("down") };
        Assert.Equal("Reminders need an internet connection.", (await Reminders.DeleteAsync(Api(offline), "o", "r1")).Error);
    }

    [Fact]
    public void FiltersToDoOverdueAndDone()
    {
        Reminder R(string id, string date, bool done) => new(id, "p", "custom", id, "", date, null, done);
        var rows = new[] { R("late", "2026-10-01", false), R("today", "2026-10-31", false), R("soon", "2026-12-01", false), R("fin", "2026-10-01", true) }
            .Select(r => new ReminderRow(r, "A", Today)).ToList();

        Assert.Equal(["late", "today", "soon"], ReminderRow.Filter(rows, "To do").Select(r => r.Id));
        Assert.Equal(["late"], ReminderRow.Filter(rows, "Overdue").Select(r => r.Id));
        Assert.Equal(["fin"], ReminderRow.Filter(rows, "Done").Select(r => r.Id));
        Assert.Equal(4, ReminderRow.Filter(rows, "All").Count());
        Assert.Equal(["Overdue", "Today", "Coming", "Done"], rows.Select(r => r.StateText));
    }
}
