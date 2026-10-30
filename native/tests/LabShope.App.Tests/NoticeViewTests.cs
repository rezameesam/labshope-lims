using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;

namespace LabShope.App.Tests;

public class NoticeViewTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-notice-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];

    public NoticeViewTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "+919876543210", null, null));
        var api = new SupabaseApi(new HttpClient(), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    private NoticeView Show()
    {
        var view = new NoticeView(_session);
        var window = new Window { Width = 1200, Height = 700, Content = view };
        window.Show(); _windows.Add(window);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        return view;
    }

    [AvaloniaFact]
    public void ShowsWhatNeedsDoingAndOpensTheRightScreenForThePatient()
    {
        _store.UpsertPatientTest(new PatientTest("t1", "p1", "CBC", DateTime.Today.AddDays(-3).ToString("yyyy-MM-dd"), "pending"));
        _store.UpsertInvoice(new Invoice("i1", "INV-1", "p1", 500m, 100m, "partial", DateTimeOffset.UtcNow.ToString("O")));
        var view = Show();

        Assert.Equal("1", view.FindControl<TextBlock>("PendingTests")!.Text);
        Assert.Equal("1", view.FindControl<TextBlock>("LateTests")!.Text);
        Assert.Equal("1", view.FindControl<TextBlock>("PendingBills")!.Text);
        Assert.Equal("0", view.FindControl<TextBlock>("LateBills")!.Text);
        Assert.Contains("2 thing(s)", view.FindControl<TextBlock>("SummaryText")!.Text);

        Patient? forTest = null, forBill = null;
        view.OpenTestRequested += p => forTest = p;
        view.OpenBillRequested += p => forBill = p;
        var grid = view.FindControl<DataGrid>("Grid")!;
        var notices = grid.ItemsSource.Cast<LabShope.Core.Visits.Notice>().ToList();
        Assert.Equal("test", notices[0].Kind); // the late test (high) comes before the recent bill (medium)

        Assert.False(view.FindControl<Button>("OpenButton")!.IsEnabled);
        grid.SelectedItem = notices[0];
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal("Enter results", view.FindControl<TextBlock>("OpenText")!.Text);
        view.FindControl<Button>("OpenButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        grid.SelectedItem = notices[1];
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        view.FindControl<Button>("OpenButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        Assert.Equal("p1", forTest!.Id);
        Assert.Equal("p1", forBill!.Id);
    }

    [AvaloniaFact]
    public void WithNothingToDoItSaysAllClear()
    {
        var view = Show();
        Assert.True(view.FindControl<StackPanel>("EmptyPanel")!.IsVisible);
        Assert.False(view.FindControl<DataGrid>("Grid")!.IsVisible);
    }

    public void Dispose()
    {
        foreach (var w in _windows) w.Close();
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_path); } catch { }
    }
}
