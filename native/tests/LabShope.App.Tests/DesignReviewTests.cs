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

        foreach (var page in new[] { "home", "register", "patients", "results", "bills", "cash" })
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
