using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;

namespace LabShope.App.Tests;

public class FlowViewTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-flowui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];
    private static readonly string Today = DateTime.Today.ToString("yyyy-MM-dd");

    public FlowViewTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "+919876543210", "female", null));
        _store.UpsertPatient(new Patient("p2", "IRM-0008", "Ravi Kumar", "+918888888888", "male", null));
        _store.UpsertPatient(new Patient("p3", "IRM-0009", "Meera Nair", "+917777777777", null, null));
        _store.UpsertPatientTest(new PatientTest("a1", "p1", "CBC", Today, "pending"));
        _store.UpsertPatientTest(new PatientTest("a2", "p1", "LFT", Today, "pending"));
        _store.UpsertPatientTest(new PatientTest("b1", "p2", "TSH", Today, "completed"));
        _store.UpsertInvoice(new Invoice("inv-b", "INV-B", "p2", 400m, 100m, "partial", DateTimeOffset.Now.ToString("O")));
        _store.UpsertPatientTest(new PatientTest("c1", "p3", "CBC", Today, "completed"));
        var api = new SupabaseApi(new HttpClient(), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    private static T Find<T>(Control root, string name) where T : Control => root.FindControl<T>(name)!;

    private FlowView Show()
    {
        var view = new FlowView(_session);
        var window = new Window { Width = 1300, Height = 760, Content = view };
        window.Show(); _windows.Add(window);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        return view;
    }

    private static void Click(Control view, string name) => Find<Button>(view, name).RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

    [AvaloniaFact]
    public void TheBoardCountsEachStageAndFiltersByIt()
    {
        var view = Show();

        Assert.Contains("All  3", Find<Button>(view, "AllChip").Content!.ToString());
        Assert.Contains("Waiting  1", Find<Button>(view, "WaitingChip").Content!.ToString());
        Assert.Contains("Ready  1", Find<Button>(view, "ReadyChip").Content!.ToString());
        Assert.Contains("Done  1", Find<Button>(view, "DoneChip").Content!.ToString());

        Click(view, "ReadyChip");
        var rows = Find<DataGrid>(view, "Grid").ItemsSource.Cast<LabShope.Core.Visits.FlowVisit>().ToList();
        Assert.Equal(["Ravi Kumar"], rows.Select(r => r.PatientName));

        Click(view, "AllChip");
        Find<TextBox>(view, "SearchBox").Text = "asha";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(["Asha Rao"], Find<DataGrid>(view, "Grid").ItemsSource.Cast<LabShope.Core.Visits.FlowVisit>().Select(r => r.PatientName));
    }

    [AvaloniaFact]
    public void StartTestingMovesTheWaitingPatientOnAndQueuesTheChange()
    {
        var view = Show();
        var changed = 0;
        view.Changed += () => changed++;
        var grid = Find<DataGrid>(view, "Grid");
        grid.SelectedItem = grid.ItemsSource.Cast<LabShope.Core.Visits.FlowVisit>().Single(v => v.PatientName == "Asha Rao");
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        Assert.True(Find<Button>(view, "PrimaryButton").IsVisible);
        Assert.Equal("Start testing", Find<Button>(view, "PrimaryButton").Content);
        Assert.Contains("Start testing", Find<TextBlock>(view, "NextStepText").Text);

        Click(view, "PrimaryButton");

        Assert.Equal(1, changed);
        Assert.Equal("in_progress", _store.GetPatientTest("a1")!.Status);
        Assert.Equal("in_progress", _store.GetPatientTest("a2")!.Status);
        Assert.Equal(2, _store.OutboxCounts().Pending);
        Assert.Contains("Testing", Find<Button>(view, "TestingChip").Content!.ToString());
        Assert.Contains("Testing started for 2", Find<TextBlock>(view, "MessageText").Text);
        Assert.Equal("Enter results", Find<Button>(view, "PrimaryButton").Content); // the next step for the same patient
    }

    [AvaloniaFact]
    public void AReadyPatientWhoOwesMoneyOffersPaymentAndTheReport()
    {
        var view = Show();
        Patient? paying = null, more = null;
        view.TakePaymentRequested += p => paying = p;
        view.RegisterMoreRequested += p => more = p;
        var grid = Find<DataGrid>(view, "Grid");
        grid.SelectedItem = grid.ItemsSource.Cast<LabShope.Core.Visits.FlowVisit>().Single(v => v.PatientName == "Ravi Kumar");
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        Assert.False(Find<Button>(view, "PrimaryButton").IsVisible); // nothing to start or enter
        Assert.True(Find<Button>(view, "PayButton").IsVisible);
        Assert.True(Find<Button>(view, "ReportButton").IsVisible);
        Assert.Contains("₹300 still to pay", Find<TextBlock>(view, "BillLine").Text);

        Click(view, "PayButton");
        Click(view, "MoreButton");
        Assert.Equal("p2", paying!.Id);
        Assert.Equal("p2", more!.Id);
    }

    [AvaloniaFact]
    public void ADonePatientHasNoPaymentButtonAndAnEmptyBoardSaysHowToStart()
    {
        var view = Show();
        var grid = Find<DataGrid>(view, "Grid");
        grid.SelectedItem = grid.ItemsSource.Cast<LabShope.Core.Visits.FlowVisit>().Single(v => v.PatientName == "Meera Nair");
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.False(Find<Button>(view, "PayButton").IsVisible);
        Assert.Contains("Nothing left to do", Find<TextBlock>(view, "NextStepText").Text);

        Find<TextBox>(view, "SearchBox").Text = "zzzz";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Contains("Nobody matches", Find<TextBlock>(view, "EmptyText").Text);
    }

    public void Dispose()
    {
        foreach (var w in _windows) w.Close();
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_path); } catch { }
    }
}
