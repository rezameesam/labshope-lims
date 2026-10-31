using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;
using LabShope.Core.Analyzers;

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

        _store.UpsertBooking(new BookingRequest("b1", "Meera Nair", "9811111111", "m@x.in", "home_collection", "2026-10-30", "CBC, Vitamin D", "after 8am", "new", null, DateTimeOffset.UtcNow.ToString("O")));
        _store.UpsertBooking(new BookingRequest("b2", "Kiran Patel", "9822222222", null, "walk_in", null, "Liver Function Test", null, "new", null, DateTimeOffset.UtcNow.AddHours(-3).ToString("O")));
        _store.UpsertBooking(new BookingRequest("b3", "Ravi Kumar", "9833333333", null, "walk_in", null, "TSH", null, "contacted", null, DateTimeOffset.UtcNow.AddDays(-1).ToString("O")));
        var visits = new VisitService(_store);
        // One visit the server refused, so the "needs attention" screen has something to show.
        var refused = visits.Register(new RegisterVisitInput("org-1", "l1", DateTime.Now.ToString("yyyy-MM-dd"), [new VisitTest("TSH", 400m)], NewPatient: new NewPatient("Kiran Joshi", "9800000099")));
        _store.SetVisitStatus(refused.VisitId, "failed", "Patient phone is required");
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
    public void TheCatalogBrowsesTestsPackagesAndDoctorsAndSearches()
    {
        var view = new CatalogView(_session);
        var window = new Window { Width = 1200, Height = 600, Content = view };
        window.Show();

        Assert.Equal(5, view.FindControl<DataGrid>("TestGrid")!.ItemsSource.Cast<object>().Count());
        view.FindControl<TextBox>("SearchBox")!.Text = "vitamin";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(["Vitamin D"], view.FindControl<DataGrid>("TestGrid")!.ItemsSource.Cast<CatalogTest>().Select(t => t.Name));
        Assert.False(view.FindControl<Button>("EditButton")!.IsVisible); // no server connection in this session: no editing

        view.FindControl<TextBox>("SearchBox")!.Text = "";
        view.FindControl<Button>("PackagesButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        Assert.Equal(["Basic Health Check"], view.FindControl<DataGrid>("PackageGrid")!.ItemsSource.Cast<TestPackage>().Select(p => p.Name));
        view.FindControl<Button>("DoctorsButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        Assert.Equal(["Dr Rao"], view.FindControl<DataGrid>("DoctorGrid")!.ItemsSource.Cast<Doctor>().Select(d => d.Name));
        window.Close();
    }

    [AvaloniaFact]
    public void TakesScreenshotsOfEveryScreen()
    {
        var dir = Environment.GetEnvironmentVariable("LABSHOPE_SHOT_DIR");
        var window = new MainWindow(_session) { Width = 1360, Height = 860 };
        window.Show();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        if (dir is null) { window.Close(); return; }

        foreach (var page in new[] { "home", "register", "patients", "results", "bills", "cash", "reports", "catalog", "bookings", "settings" })
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
            var json = p.EndsWith("/patient_tests") ? """[{"id":"t1","test_name":"HbA1c","outsource_cost":200,"outsourced_at":"2026-10-29T10:00:00","patients":{"patient_id":"IRM-1","full_name":"Asha Rao"},"external_labs":{"name":"Metro Labs"}}]"""
                : p.EndsWith("/invoice_items") ? """[{"patient_test_id":"t1","amount":500}]"""
                : p.EndsWith("/accounts") ? """[{"id":"c","code":"1001","name":"Cash","type":"asset"},{"id":"a","code":"1003","name":"Accounts Receivable","type":"asset"},{"id":"r","code":"4001","name":"Test Revenue","type":"revenue"}]"""
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
    public async Task ProfitAndLossAndTheBalanceSheetAreWorkedOutFromTheSameBooks()
    {
        var (view, _) = Open(offline: false);
        await view.ShowReportAsync("pl");
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        Assert.True(view.FindControl<DockPanel>("StatementPanel")!.IsVisible);
        Assert.False(view.FindControl<Grid>("Body")!.IsVisible);
        Assert.True(view.FindControl<Button>("PrintButton")!.IsVisible);
        var pl = view.FindControl<DataGrid>("StatementGrid")!.ItemsSource.Cast<LabShope.Core.Finance.StatementLine>().ToList();
        Assert.Contains(pl, l => l is { Label: "Net profit", Amount: 750m });          // 750 of test revenue, no expenses
        Assert.Contains("Profit 750.00", view.FindControl<TextBlock>("TallyText")!.Text);

        await view.ShowReportAsync("bs");
        var bs = view.FindControl<DataGrid>("StatementGrid")!.ItemsSource.Cast<LabShope.Core.Finance.StatementLine>().ToList();
        Assert.Contains(bs, l => l is { Label: "Total assets", Amount: 750m });        // cash 750 + receivables 0
        Assert.Contains("Balanced", view.FindControl<TextBlock>("TallyText")!.Text);

        await view.ShowReportAsync("trial");
        Assert.True(view.FindControl<Grid>("Body")!.IsVisible);
        Assert.False(view.FindControl<DockPanel>("StatementPanel")!.IsVisible);
    }

    [AvaloniaFact]
    public async Task TheOutsourceReportShowsCostBilledAndMarginPerOutsideLab()
    {
        var (view, _) = Open(offline: false);
        await view.ShowReportAsync("out");
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        Assert.True(view.FindControl<DockPanel>("OutsourcePanel")!.IsVisible);
        Assert.False(view.FindControl<Grid>("Body")!.IsVisible);
        var labs = view.FindControl<DataGrid>("OutsourceLabGrid")!.ItemsSource.Cast<LabShope.Core.Finance.LabSummary>().ToList();
        Assert.Equal(("Metro Labs", 1, 200m, 500m, 300m), (labs[0].Lab, labs[0].Count, labs[0].Cost, labs[0].Revenue, labs[0].Margin));
        Assert.Contains("margin 300.00", view.FindControl<TextBlock>("OutsourceTotals")!.Text);

        await view.ShowReportAsync("trial");
        Assert.False(view.FindControl<DockPanel>("OutsourcePanel")!.IsVisible);
        Assert.True(view.FindControl<Grid>("Body")!.IsVisible);
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

public class BookingScreenTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];

    public BookingScreenTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog([new CatalogTest("t1", "CBC", "CBC", 350m, null), new CatalogTest("t2", "VITD", "Vitamin D", 900m, null)], [], [], [new LabRef("l1", "Main", "M")], []));
        _store.UpsertBooking(new BookingRequest("b1", "Meera Nair", "9811111111", "m@x.in", "home_collection", "2026-10-30", "CBC, Vitamin D, Allergy panel", "after 8am", "new", null, DateTimeOffset.UtcNow.ToString("O")));
        _store.UpsertBooking(new BookingRequest("b2", "Ravi Kumar", "9822222222", null, "walk_in", null, "LFT", null, "contacted", null, DateTimeOffset.UtcNow.AddDays(-1).ToString("O")));
        var api = new SupabaseApi(new System.Net.Http.HttpClient(), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    private static T Find<T>(Control root, string name) where T : Control => root.FindControl<T>(name)!;

    [AvaloniaFact]
    public void ListsNewRequestsAndAStatusChangeIsQueued()
    {
        var view = new BookingsView(_session);
        var window = new Window { Width = 1300, Height = 600, Content = view };
        window.Show(); _windows.Add(window);

        var grid = Find<DataGrid>(view, "Grid");
        Assert.Equal(["Meera Nair"], grid.ItemsSource.Cast<BookingRequest>().Select(b => b.FullName)); // "New" is the default view

        grid.SelectedIndex = 0;
        Assert.Contains("Meera Nair", Find<TextBlock>(view, "NameText").Text);
        Find<ComboBox>(view, "StatusBox").SelectedItem = "contacted";

        Assert.Equal("contacted", _store.GetBooking("b1")!.Status);
        Assert.Equal((1, 0), _store.OutboxCounts());
        Assert.Equal(0, _store.NewBookingCount());
    }

    [AvaloniaFact]
    public void RegisteringFromABookingPrefillsThePatientAndTestsThenMarksItConverted()
    {
        var view = new RegisterVisitView(_session);
        var window = new Window { Width = 1300, Height = 800, Content = view };
        window.Show(); _windows.Add(window);

        view.PrefillFromBooking(_store.GetBooking("b1")!);

        Assert.Equal("Meera Nair", Find<TextBox>(view, "NewName").Text);
        Assert.Equal("9811111111", Find<TextBox>(view, "NewPhone").Text);
        Assert.Equal("Total 1250", Find<TextBlock>(view, "TotalText").Text); // CBC + Vitamin D matched; "Allergy panel" is not in the catalog
        Assert.Contains("Allergy panel", Find<TextBlock>(view, "ResultText").Text); // the person is told to add it by hand

        Find<TextBox>(view, "PayAmount").Text = "0";
        Find<Button>(view, "SaveButton").RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        var booking = _store.GetBooking("b1")!;
        Assert.True(booking.Status == "converted", "ResultText: " + Find<TextBlock>(view, "ResultText").Text);
        Assert.NotNull(booking.PatientId);
        Assert.Equal(booking.PatientId, _store.SearchPatients("meera").Single().Id);
        Assert.Equal((2, 0), _store.OutboxCounts()); // the visit, then the booking update (so the patient exists on the server first)
    }

    [AvaloniaFact]
    public void AKnownPhoneNumberPicksTheExistingPatientInsteadOfCreatingADuplicate()
    {
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Meera N.", "+919811111111", "female", null));
        var view = new RegisterVisitView(_session);
        var window = new Window { Width = 1300, Height = 800, Content = view };
        window.Show(); _windows.Add(window);

        view.PrefillFromBooking(_store.GetBooking("b1")!);

        Assert.Contains("IRM-0001", Find<TextBlock>(view, "PickedPatient").Text);
        Assert.Equal("", Find<TextBox>(view, "NewName").Text ?? "");
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


public class SettingsScreenTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];

    public SettingsScreenTests()
    {
        _store = new LocalStore(_path);
        var api = new SupabaseApi(new System.Net.Http.HttpClient(), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    [AvaloniaFact]
    public void ShowsWhatTheServerRefusedAndRetryPutsItBack()
    {
        var visit = new VisitService(_store).Register(new RegisterVisitInput("org-1", "l1", "2026-10-29", [new VisitTest("CBC", 300m)], NewPatient: new NewPatient("Asha Rao", "9876543210")));
        _store.SetVisitStatus(visit.VisitId, "failed", "Patient phone is required");

        var view = new SettingsView(_session);
        var window = new Window { Width = 1200, Height = 700, Content = view };
        window.Show(); _windows.Add(window);

        var grid = view.FindControl<DataGrid>("QueueGrid")!;
        var entry = grid.ItemsSource.Cast<OutboxEntry>().Single();
        Assert.Equal(("Visit registration", "failed", "Patient phone is required"), (entry.What, entry.Badge, entry.LastError));
        Assert.Contains("Needs attention", view.FindControl<TextBlock>("QueueTitle")!.Text);
        Assert.False(view.FindControl<Button>("RetryButton")!.IsEnabled); // nothing selected yet

        var asked = false; view.SyncRequested += () => asked = true;
        grid.SelectedItem = entry;
        Assert.True(view.FindControl<Button>("RetryButton")!.IsEnabled);
        view.FindControl<Button>("RetryButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        Assert.Equal("pending", _store.GetVisit(visit.VisitId)!.Status);
        Assert.True(asked); // retrying also asks for a sync straight away
    }

    [AvaloniaFact]
    public void SaysSoWhenNothingIsWaiting()
    {
        var view = new SettingsView(_session);
        var window = new Window { Width = 1200, Height = 700, Content = view };
        window.Show(); _windows.Add(window);
        Assert.True(view.FindControl<TextBlock>("QueueEmpty")!.IsVisible);
        Assert.Equal("Demo Lab", view.FindControl<TextBlock>("LabLine")!.Text);
        Assert.Equal("admin", view.FindControl<TextBlock>("RoleLine")!.Text);
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

public class OrganizationViewTests : IDisposable
{
    private sealed class TeamHandler : System.Net.Http.HttpMessageHandler
    {
        protected override Task<System.Net.Http.HttpResponseMessage> SendAsync(System.Net.Http.HttpRequestMessage r, CancellationToken ct) =>
            Task.FromResult(new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new System.Net.Http.StringContent("""[{"id":"e1","employee_id":"E001","full_name":"Asha Rao","email":"a@x.in","phone":null,"designation":"Technician","department":"Haematology","lab_id":"l1","is_active":true}]""", System.Text.Encoding.UTF8, "application/json"),
            });
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly List<Window> _windows = [];

    public OrganizationViewTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog([], [], [], [new LabRef("l1", "Main Lab", "ML"), new LabRef("l2", "Branch Lab", "BL")], [new CenterRef("c1", "Town Centre", "TN", "l1")]));
    }

    [AvaloniaFact]
    public async Task ShowsLabsAndCentresFromThePcAndTheTeamFromTheServer()
    {
        var api = new SupabaseApi(new System.Net.Http.HttpClient(new TeamHandler()), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };
        var session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"), api);
        var view = new OrganizationView(session);
        var window = new Window { Width = 1200, Height = 600, Content = view };
        window.Show(); _windows.Add(window);

        Assert.Equal(["Main Lab", "Branch Lab"], view.FindControl<DataGrid>("LabGrid")!.ItemsSource.Cast<LabRef>().Select(l => l.Name).OrderByDescending(n => n));
        Assert.Equal(["Town Centre"], view.FindControl<DataGrid>("CenterGrid")!.ItemsSource.Cast<CenterRef>().Select(c => c.Name));

        await view.LoadTeamForTestAsync();
        Assert.Equal(["Asha Rao"], view.FindControl<DataGrid>("TeamGrid")!.ItemsSource.Cast<TeamMember>().Select(m => m.FullName));
        Assert.False(view.FindControl<Border>("MessageCard")!.IsVisible);
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

public class InventoryScreenTests : IDisposable
{
    private sealed class StockHandler : System.Net.Http.HttpMessageHandler
    {
        protected override Task<System.Net.Http.HttpResponseMessage> SendAsync(System.Net.Http.HttpRequestMessage r, CancellationToken ct) =>
            Task.FromResult(new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new System.Net.Http.StringContent("""
                    [{"id":"a","name":"Gloves","type":"consumable","sku":null,"unit":"box","current_stock":3,"min_stock_level":5,"unit_price":120,"supplier":null,"location":"Shelf 1","is_active":true},
                     {"id":"b","name":"CBC reagent","type":"reagent","sku":"R1","unit":"ml","current_stock":0,"min_stock_level":10,"unit_price":8,"supplier":null,"location":"Fridge","is_active":true},
                     {"id":"d","name":"Slides","type":"consumable","sku":null,"unit":"box","current_stock":40,"min_stock_level":5,"unit_price":50,"supplier":null,"location":null,"is_active":true}]
                    """, System.Text.Encoding.UTF8, "application/json"),
            });
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly List<Window> _windows = [];
    public InventoryScreenTests() => _store = new LocalStore(_path);

    [AvaloniaFact]
    public async Task ShowsStockWithLowWarningsAndFilters()
    {
        var api = new SupabaseApi(new System.Net.Http.HttpClient(new StockHandler()), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };
        var session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"), api);
        var view = new InventoryView(session);
        var window = new Window { Width = 1200, Height = 600, Content = view };
        window.Show(); _windows.Add(window);

        await view.LoadAsync();
        var grid = view.FindControl<DataGrid>("Grid")!;
        Assert.Equal(["low", "out", "ok"], grid.ItemsSource.Cast<InventoryItem>().Select(i => i.Level));
        Assert.Contains("2 low or out", view.FindControl<TextBlock>("CountText")!.Text);

        view.FindControl<CheckBox>("LowOnly")!.IsChecked = true;
        Assert.Equal(["Gloves", "CBC reagent"], grid.ItemsSource.Cast<InventoryItem>().Select(i => i.Name));
        view.FindControl<CheckBox>("LowOnly")!.IsChecked = false;
        view.FindControl<TextBox>("SearchBox")!.Text = "slides";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(["Slides"], grid.ItemsSource.Cast<InventoryItem>().Select(i => i.Name));
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

public class InstrumentsScreenTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];

    public InstrumentsScreenTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog([new CatalogTest("t1", "CBC", "CBC", 350m, null)], [], [], [], []));
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "+919876543210", "female", null));
        new VisitService(_store).Register(new RegisterVisitInput("org-1", "l1", DateTime.Now.ToString("yyyy-MM-dd"), [new VisitTest("CBC", 350m)], ExistingPatient: _store.GetPatient("p1")));
        var api = new SupabaseApi(new System.Net.Http.HttpClient(), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    private static int FreePort() { var l = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0); l.Start(); var p = ((System.Net.IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p; }

    [AvaloniaFact]
    public async Task AMachineResultArrivesOverTheNetworkIsMatchedAndAcceptedIntoTheTest()
    {
        using var host = new InstrumentHost(_session);
        var port = FreePort();
        host.Apply(new InstrumentSettings(NetworkEnabled: true, NetworkPort: port));
        Assert.Contains("Listening", host.NetworkStatus);

        var view = new InstrumentsView(_session, host);
        var window = new Window { Width = 1300, Height = 900, Content = view };
        window.Show(); _windows.Add(window);

        // A pretend analyzer sends an HL7 CBC for the barcode printed on Asha's label.
        using (var client = new System.Net.Sockets.TcpClient())
        {
            await client.ConnectAsync("127.0.0.1", port);
            var msg = "MSH|^~\\&|BC-6800|LAB|LIS|HOSP|20261029120000||ORU^R01|M1|P|2.3.1\rOBR|1||IRM-0007\rOBX|1|NM|WBC^White cells||6.1|10^9/L|3.5-10.0|N|||F\rOBX|2|NM|HGB^Haemoglobin||9.8|g/dL|11.5-16.5|L|||F\r";
            byte[] wrapped = [0x0B, .. System.Text.Encoding.UTF8.GetBytes(msg), 0x1C, 0x0D];
            await client.GetStream().WriteAsync(wrapped);
            await client.GetStream().ReadAsync(new byte[64]); // the acknowledgement
        }

        // The result is handed over on the window's thread.
        for (var i = 0; i < 300 && _store.NewInstrumentCount() == 0; i++) { await Task.Delay(30); Avalonia.Threading.Dispatcher.UIThread.RunJobs(); }
        Assert.Equal(1, _store.NewInstrumentCount());

        var grid = view.FindControl<DataGrid>("Grid")!;
        // The screen refreshes its table on the window's thread a moment after the result is stored: wait for it.
        for (var i = 0; i < 300 && grid.ItemsSource?.Cast<object>().Any() != true; i++) { await Task.Delay(30); Avalonia.Threading.Dispatcher.UIThread.RunJobs(); }
        var entry = grid.ItemsSource!.Cast<InstrumentEntry>().Single();
        Assert.Equal(("IRM-0007", "p1", 2), (entry.SampleId, entry.PatientId, entry.ParameterCount));
        Assert.Contains("to check", view.FindControl<TextBlock>("InboxTitle")!.Text);

        grid.SelectedItem = entry;
        var detail = view.FindControl<DataGrid>("DetailGrid")!;
        for (var i = 0; i < 300 && detail.ItemsSource?.Cast<object>().Any() != true; i++) { await Task.Delay(30); Avalonia.Threading.Dispatcher.UIThread.RunJobs(); }
        Assert.Equal(2, detail.ItemsSource!.Cast<object>().Count());
        var accepted = false; view.ResultAccepted += () => accepted = true;
        view.FindControl<Button>("AcceptButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        Assert.True(accepted);
        var done = _store.SearchWorklist("", ["completed"]).Single();
        Assert.Equal(("CBC", "abnormal"), (done.TestName, done.Badge)); // HGB 9.8 is below the standard range
        Assert.Equal(0, _store.NewInstrumentCount());

        if (Environment.GetEnvironmentVariable("LABSHOPE_SHOT_DIR") is { } dir)
        {
            view.FindControl<ComboBox>("FilterBox")!.SelectedIndex = 1;
            Avalonia.Threading.Dispatcher.UIThread.RunJobs();
            window.CaptureRenderedFrame()!.Save(Path.Combine(dir, "app-instruments.png"));
        }
    }

    [AvaloniaFact]
    public void SettingsAreCheckedAndRemembered()
    {
        using var host = new InstrumentHost(_session);
        var view = new InstrumentsView(_session, host);
        var window = new Window { Width = 1200, Height = 800, Content = view };
        window.Show(); _windows.Add(window);

        view.FindControl<CheckBox>("NetworkBox")!.IsChecked = true;
        view.FindControl<TextBox>("PortBox")!.Text = "80";
        view.FindControl<Button>("SaveButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        Assert.Contains("1024", view.FindControl<TextBlock>("SettingsMessage")!.Text);
        Assert.False(InstrumentSettings.Load(_store).NetworkEnabled); // a bad setting is not saved

        view.FindControl<TextBox>("PortBox")!.Text = FreePort().ToString();
        view.FindControl<Button>("SaveButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        Assert.True(InstrumentSettings.Load(_store).NetworkEnabled);
        Assert.Contains("Listening", host.NetworkStatus);
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
