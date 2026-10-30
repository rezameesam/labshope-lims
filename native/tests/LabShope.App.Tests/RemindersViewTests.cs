using System.Net;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.App.Tests;

public class RemindersViewTests : IDisposable
{
    private sealed class Server : HttpMessageHandler
    {
        public List<(string Method, string Path, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content is null ? "" : await r.Content.ReadAsStringAsync(ct);
            Calls.Add((r.Method.Method, r.RequestUri!.AbsolutePath, body));
            var json = r.Method == HttpMethod.Get && r.RequestUri.AbsolutePath.EndsWith("/patient_test_audit")
                ? """[{"action":"result_updated","changed_by":null,"changed_at":"2026-10-30T10:00:00Z","old_values":{"result":"12"},"new_values":{"result":"14"}}]"""
                : r.Method == HttpMethod.Get && r.RequestUri.AbsolutePath.EndsWith("/employees") ? "[]"
                : r.Method == HttpMethod.Get
                ? """[{"id":"r1","patient_id":"p1","reminder_type":"follow_up","title":"Call back","message":"","reminder_date":"2020-01-01","due_date":null,"is_completed":false},{"id":"r2","patient_id":"p1","reminder_type":"payment","title":"Dues","message":"","reminder_date":"2020-01-02","due_date":null,"is_completed":true}]"""
                : r.Method.Method is "PATCH" or "DELETE" ? """[{"id":"r1"}]""" : "";
            return new HttpResponseMessage(r.Method == HttpMethod.Post ? HttpStatusCode.Created : HttpStatusCode.OK)
            { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
        }
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-reminders-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly Server _server = new();
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];

    public RemindersViewTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "+919876543210", null, null));
        var api = new SupabaseApi(new HttpClient(_server), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u-1", null) };
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"), api);
    }

    private async Task<(Window, RemindersView)> OpenAsync()
    {
        var view = new RemindersView(_session);
        var window = new Window { Content = view };
        window.Show(); _windows.Add(window);
        await view.RefreshAsync();
        return (window, view);
    }

    [AvaloniaFact]
    public async Task ShowsThePatientsNameAndOnlyWhatIsStillToDoByDefault()
    {
        var (_, view) = await OpenAsync();
        var rows = view.FindControl<DataGrid>("Grid")!.ItemsSource!.Cast<ReminderRow>().ToList();

        Assert.Equal(["Call back"], rows.Select(r => r.Title));
        Assert.Equal("Asha Rao", rows[0].PatientName);
        Assert.Equal("Overdue", rows[0].StateText);
        Assert.Equal("1 to do, 1 overdue", view.FindControl<TextBlock>("SummaryText")!.Text);
    }

    [AvaloniaFact]
    public async Task MarkingDoneAndDeletingGoToTheServerAndReload()
    {
        var (_, view) = await OpenAsync();
        var row = view.FindControl<DataGrid>("Grid")!.ItemsSource!.Cast<ReminderRow>().First();

        await view.SetDoneAsync(row, true);
        var patch = Assert.Single(_server.Calls, c => c.Method == "PATCH");
        Assert.EndsWith("/patient_reminders", patch.Path);
        Assert.Contains("\"is_completed\":true", patch.Body);

        await view.DeleteAsync(row);
        Assert.Contains(_server.Calls, c => c.Method == "DELETE");
        Assert.Equal("Reminder deleted.", view.FindControl<TextBlock>("MessageText")!.Text);
    }

    [AvaloniaFact]
    public async Task TheDialogSavesANewReminderForTheChosenPatient()
    {
        var dialog = new ReminderDialog(_session, patient: _store.GetPatient("p1"));
        dialog.Show(); _windows.Add(dialog);
        dialog.FindControl<TextBox>("TitleBox")!.Text = "Annual checkup";
        dialog.FindControl<TextBox>("DateBox")!.Text = "2026-12-01";

        await dialog.SaveAsync();

        Assert.True(dialog.Saved);
        var post = Assert.Single(_server.Calls, c => c.Method == "POST");
        Assert.EndsWith("/patient_reminders", post.Path);
        Assert.Contains("\"patient_id\":\"p1\"", post.Body);
        Assert.Contains("\"title\":\"Annual checkup\"", post.Body);
    }

    [AvaloniaFact]
    public async Task TheDialogWithoutAPatientShowsTheProblemAndSendsNothing()
    {
        var dialog = new ReminderDialog(_session);
        dialog.Show(); _windows.Add(dialog);
        dialog.FindControl<TextBox>("TitleBox")!.Text = "x";

        await dialog.SaveAsync();

        Assert.False(dialog.Saved);
        Assert.Equal("Choose a patient.", dialog.FindControl<TextBlock>("ErrorText")!.Text);
        Assert.DoesNotContain(_server.Calls, c => c.Method == "POST");
    }

    [AvaloniaFact]
    public async Task TheHistoryDialogListsWhoChangedTheResult()
    {
        var dialog = new ResultHistoryDialog(_session, new PatientTest("t1", "p1", "CBC", "2026-10-30", "completed"));
        dialog.Show(); _windows.Add(dialog);
        await dialog.LoadAsync();

        var rows = dialog.FindControl<DataGrid>("Grid")!.ItemsSource!.Cast<ResultHistoryEntry>().ToList();
        Assert.Equal("Result changed from 12 to 14", Assert.Single(rows).Summary);
        Assert.Equal("1 change(s), newest first.", dialog.FindControl<TextBlock>("StatusText")!.Text);
    }

    [AvaloniaFact]
    public void TheOverviewDrawsTheTrendChartsAndTheMostOrderedTests()
    {
        _store.UpsertPatientTest(new PatientTest("t1", "p1", "CBC", DateTime.Today.ToString("yyyy-MM-dd"), "completed"));
        var view = new OverviewView(_session);
        var window = new Window { Width = 1300, Height = 900, Content = view };
        window.Show(); _windows.Add(window);

        Assert.Equal(14, view.FindControl<Grid>("MoneyChart")!.Children.Count);
        Assert.Equal(14, view.FindControl<Grid>("TestsChart")!.Children.Count);
        Assert.Equal("1 test(s)", view.FindControl<TextBlock>("TestsSummary")!.Text);
        Assert.Single(view.FindControl<ItemsControl>("TopTests")!.ItemsSource!.Cast<object>());
    }

    [AvaloniaFact]
    public void TheSubscriptionPageShowsThePlanFromTheLastCheck()
    {
        var empty = new SubscriptionView(_session);
        Assert.Equal("Unknown", empty.FindControl<TextBlock>("StatusText")!.Text);

        _store.SetMeta("subscription", System.Text.Json.JsonSerializer.Serialize(new SubscriptionInfo("active", "pro_plus", null, DateTimeOffset.Now.AddDays(5), false, null)));
        var view = new SubscriptionView(_session);
        var window = new Window { Content = view };
        window.Show(); _windows.Add(window);

        Assert.Equal("Active", view.FindControl<TextBlock>("StatusText")!.Text);
        Assert.Equal("Pro plus", view.FindControl<TextBlock>("PlanText")!.Text);
        Assert.True(view.FindControl<Border>("NoticeCard")!.IsVisible); // ends in 5 days
        Assert.Contains("ends in", view.FindControl<TextBlock>("NoticeText")!.Text);
    }

    public void Dispose()
    {
        foreach (var w in _windows) w.Close();
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_path); } catch { }
    }
}
