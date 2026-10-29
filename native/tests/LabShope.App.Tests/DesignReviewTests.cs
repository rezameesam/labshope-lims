using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.App.Tests;

/// <summary>Opens the whole window with realistic sample data and, when LABSHOPE_SHOT_DIR is set, saves a picture of each screen.</summary>
public class DesignReviewTests : IDisposable
{
    private sealed class OfflineHandler : System.Net.Http.HttpMessageHandler
    {
        protected override Task<System.Net.Http.HttpResponseMessage> SendAsync(System.Net.Http.HttpRequestMessage r, CancellationToken ct) => throw new System.Net.Http.HttpRequestException("offline");
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;

    public DesignReviewTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog(
            [new CatalogTest("t1", "HB", "Haemoglobin", 200m, null, "g/dL", "13 - 17", 13m, 17m), new CatalogTest("t2", "CBC", "CBC", 350m, null),
             new CatalogTest("t3", "LFT", "Liver Function Test", 650m, null), new CatalogTest("t4", "VITD", "Vitamin D", 900m, null), new CatalogTest("t5", "TSH", "TSH", 400m, null)],
            [new TestPackage("pk1", "Basic Health Check", 1200m, ["t2", "t3"])], [new Doctor("d1", "Dr Rao", "Pathology", 10m)],
            [new LabRef("l1", "Main Lab", "ML")], [new CenterRef("cc1", "Town Centre", "TN", "l1")]));

        string[] names = ["Asha Rao", "Ravi Kumar", "Meera Nair", "Imran Sheikh", "Priya Menon", "Arjun Das", "Fatima Khan", "Suresh Iyer", "Neha Gupta", "Vikram Singh"];
        for (var i = 0; i < names.Length; i++)
            _store.UpsertPatient(new Patient($"p{i}", $"IRM-{i + 1:0000}", names[i], $"+9198{i:00}000{i + 1:000}", i % 2 == 0 ? "female" : "male", $"19{70 + i}-05-0{i % 9 + 1}"));

        var visits = new VisitService(_store);
        string[][] tests = [["CBC", "Liver Function Test"], ["Haemoglobin"], ["TSH", "Vitamin D"], ["CBC"], ["Liver Function Test"]];
        for (var i = 0; i < 5; i++)
        {
            var v = visits.Register(new RegisterVisitInput("org-1", "l1", DateTime.Now.ToString("yyyy-MM-dd"),
                tests[i].Select(t => new VisitTest(t, t == "CBC" ? 350m : t == "Haemoglobin" ? 200m : t == "TSH" ? 400m : t == "Vitamin D" ? 900m : 650m)).ToList(),
                ExistingPatient: _store.GetPatient($"p{i}"),
                Payment: i switch { 0 => new InitialPayment(1000m, "upi"), 1 => new InitialPayment(200m), 2 => new InitialPayment(500m, "card"), _ => null }));
        }
        var results = new ResultService(_store, "org-1", "u1");
        var done = _store.SearchWorklist("", ["pending"]).First(r => r.TestName == "Haemoglobin");
        results.Enter(done.Id, "11.8");

        var api = new SupabaseApi(new System.Net.Http.HttpClient(new OfflineHandler()), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("sunrise", "org-1", "Sunrise Diagnostics", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    [AvaloniaFact]
    public void TakesScreenshotsOfEveryScreen()
    {
        var dir = Environment.GetEnvironmentVariable("LABSHOPE_SHOT_DIR");
        var window = new MainWindow(_session) { Width = 1360, Height = 860 };
        window.Show();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        if (dir is null) { window.Close(); return; }

        foreach (var page in new[] { "home", "register", "patients", "results", "bills", "cash", "reports" })
        {
            window.Show(page);
            if (page == "register")
            {
                var reg = (RegisterVisitView)((ContentControl)window.FindControl<ContentControl>("Page")!).Content!;
                reg.UsePatient(_store.GetPatient("p6")!);
                var search = reg.FindControl<TextBox>("TestSearch")!;
                foreach (var t in new[] { "cbc", "vitamin" }) { search.Text = t; Avalonia.Threading.Dispatcher.UIThread.RunJobs(); search.RaiseEvent(new Avalonia.Input.KeyEventArgs { RoutedEvent = Avalonia.Input.InputElement.KeyDownEvent, Key = Avalonia.Input.Key.Enter }); }
            }
            Avalonia.Threading.Dispatcher.UIThread.RunJobs();
            window.CaptureRenderedFrame()!.Save(Path.Combine(dir, $"app-{page}.png"));
        }
        window.Close();

        var login = new LoginWindow(_session.Account, "reception@sunrise.example");
        login.Show();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        login.CaptureRenderedFrame()!.Save(Path.Combine(dir, "app-login.png"));
        login.Close();
    }

    public void Dispose()
    {
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}

public class FinanceViewTests : IDisposable
{
    private sealed class BooksHandler(bool offline = false) : System.Net.Http.HttpMessageHandler
    {
        protected override Task<System.Net.Http.HttpResponseMessage> SendAsync(System.Net.Http.HttpRequestMessage r, CancellationToken ct)
        {
            if (offline) throw new System.Net.Http.HttpRequestException("offline");
            var p = r.RequestUri!.AbsolutePath;
            var json = p.EndsWith("/accounts") ? """[{"id":"c","code":"1001","name":"Cash","type":"asset"},{"id":"a","code":"1003","name":"Accounts Receivable","type":"asset"},{"id":"r","code":"4001","name":"Test Revenue","type":"revenue"}]"""
                : p.EndsWith("/journal_entries") ? """[{"id":"e1","entry_number":"AUTO-00001","entry_date":"2026-10-29","description":"Invoice INV1","reference":"INV1"},{"id":"e2","entry_number":"AUTO-00002","entry_date":"2026-10-29","description":"Payment - INV1","reference":null}]"""
                : """[{"journal_entry_id":"e1","account_id":"a","debit":750,"credit":0},{"journal_entry_id":"e1","account_id":"r","debit":0,"credit":750},{"journal_entry_id":"e2","account_id":"c","debit":750,"credit":0},{"journal_entry_id":"e2","account_id":"a","debit":0,"credit":750}]""";
            return Task.FromResult(new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json") });
        }
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly List<Window> _windows = [];

    public FinanceViewTests() => _store = new LocalStore(_path);

    private (FinanceView View, Window Window) Open(bool offline)
    {
        var api = new SupabaseApi(new System.Net.Http.HttpClient(new BooksHandler(offline)), "https://x.supabase.co", "anon")
        { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };
        var session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"), api);
        var view = new FinanceView(session);
        var window = new Window { Width = 1300, Height = 700, Content = view };
        window.Show(); _windows.Add(window);
        return (view, window);
    }

    [AvaloniaFact]
    public async Task ShowsTheTrialBalanceAndSaysTheBooksBalance()
    {
        var (view, window) = Open(offline: false);
        await view.LoadAsync();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        Assert.Equal(3, view.FindControl<DataGrid>("BalanceGrid")!.ItemsSource.Cast<object>().Count());
        Assert.Equal(2, view.FindControl<DataGrid>("EntryGrid")!.ItemsSource.Cast<object>().Count());
        Assert.Contains("Books balance", view.FindControl<TextBlock>("TallyText")!.Text);
        Assert.False(view.FindControl<Border>("MessageCard")!.IsVisible);

        if (Environment.GetEnvironmentVariable("LABSHOPE_SHOT_DIR") is { } dir)
            window.CaptureRenderedFrame()!.Save(Path.Combine(dir, "app-finance.png"));
    }

    [AvaloniaFact]
    public async Task SaysPlainlyThatFinanceNeedsTheInternetWhenOffline()
    {
        var (view, _) = Open(offline: true);
        await view.LoadAsync();
        Assert.True(view.FindControl<Border>("MessageCard")!.IsVisible);
        Assert.Contains("internet", view.FindControl<TextBlock>("MessageText")!.Text);
        Assert.False(view.FindControl<Border>("TallyChip")!.IsVisible);
    }

    public void Dispose()
    {
        foreach (var w in _windows) w.Close();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
