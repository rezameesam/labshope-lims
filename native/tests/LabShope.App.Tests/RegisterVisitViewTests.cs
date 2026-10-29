using System.Net.Http;
using System.Text.Json;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.App;
using LabShope.Core.Net;
using LabShope.Core.Sync;

namespace LabShope.App.Tests;

public class RegisterVisitViewTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-ui-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;

    public RegisterVisitViewTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog(
            [new CatalogTest("t1", "CBC", "CBC", 300m, null), new CatalogTest("t2", "LFT", "Liver Function Test", 450m, null), new CatalogTest("t3", "VITD", "Vitamin D", 900m, null)],
            [new TestPackage("pk1", "Basic Health", 600m, ["t1", "t2"])],
            [new Doctor("d1", "Dr Rao", "Pathology", 10m)], [new LabRef("l1", "Main Lab", "ML")], [new CenterRef("cc1", "Town", "TN", "l1")]));
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "+919876543210", "female", null));

        var api = new SupabaseApi(new HttpClient(), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    private (Window Window, RegisterVisitView View) Show()
    {
        var view = new RegisterVisitView(_session);
        var window = new Window { Width = 1200, Height = 760, Content = view };
        window.Show();
        return (window, view);
    }

    private static T Find<T>(Control root, string name) where T : Control => root.FindControl<T>(name)!;

    private static void Type(TextBox box, string text)
    {
        box.Text = text;
        Avalonia.Threading.Dispatcher.UIThread.RunJobs(); // let the text-changed handlers run, like they would between key presses
    }

    private static void Press(TextBox box, Key key) =>
        box.RaiseEvent(new KeyEventArgs { RoutedEvent = InputElement.KeyDownEvent, Key = key });

    [AvaloniaFact]
    public void RegistersANewPatientWithTestsAndQueuesIt()
    {
        var (_, view) = Show();
        Find<RadioButton>(view, "NewRadio").IsChecked = true;
        Type(Find<TextBox>(view, "NewName"), "Ravi Kumar");
        Type(Find<TextBox>(view, "NewPhone"), "98765 00001");

        var search = Find<TextBox>(view, "TestSearch");
        Type(search, "vitamin"); Press(search, Key.Enter);
        Type(search, "cbc"); Press(search, Key.Enter);

        Assert.Equal("Total 1200", Find<TextBlock>(view, "TotalText").Text);

        Find<Button>(view, "SaveButton").RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        var queued = _store.NextPendingVisit()!;
        Assert.Equal("Ravi Kumar", queued.PatientName);
        Assert.Equal(1200m, queued.TotalAmount);
        var payload = JsonDocument.Parse(queued.PayloadJson).RootElement;
        Assert.Equal(2, payload.GetProperty("tests").GetArrayLength());
        Assert.Contains("Saved: Ravi Kumar", Find<TextBlock>(view, "ResultText").Text);
        Assert.Equal("Total 0", Find<TextBlock>(view, "TotalText").Text); // form cleared for the next patient
    }

    [AvaloniaFact]
    public void PayingNowFollowsTheTotalAndSavesAReceipt()
    {
        var (_, view) = Show();
        var search = Find<TextBox>(view, "TestSearch");
        Type(search, "cbc"); Press(search, Key.Enter);
        Assert.Equal("300", Find<TextBox>(view, "PayAmount").Text); // pay in full by default

        view.UsePatient(_store.GetPatient("p1")!);
        Find<Button>(view, "SaveButton").RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        Assert.Contains("paid in full", Find<TextBlock>(view, "ResultText").Text);
        Assert.True(Find<Button>(view, "ReceiptButton").IsVisible);
        Assert.Equal((2, 0), _store.OutboxCounts()); // the visit and its payment
        Assert.Equal("paid", _store.SearchBills("").Single().PaymentStatus);
    }

    [AvaloniaFact]
    public void APartPaymentLeavesABalance()
    {
        var (_, view) = Show();
        var search = Find<TextBox>(view, "TestSearch");
        Type(search, "cbc"); Press(search, Key.Enter);
        Type(Find<TextBox>(view, "PayAmount"), "100");
        view.UsePatient(_store.GetPatient("p1")!);
        Find<Button>(view, "SaveButton").RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        Assert.Contains("200 due", Find<TextBlock>(view, "ResultText").Text);
        var bill = _store.SearchBills("").Single();
        Assert.Equal(("partial", 200m), (bill.PaymentStatus, bill.Balance));
    }

    [AvaloniaFact]
    public void PayingMoreThanTheTotalIsRefused()
    {
        var (_, view) = Show();
        var search = Find<TextBox>(view, "TestSearch");
        Type(search, "cbc"); Press(search, Key.Enter);
        Type(Find<TextBox>(view, "PayAmount"), "999");
        view.UsePatient(_store.GetPatient("p1")!);
        Find<Button>(view, "SaveButton").RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));

        Assert.Contains("more than the total", Find<TextBlock>(view, "ResultText").Text);
        Assert.Null(_store.NextPendingVisit());
    }

    [AvaloniaFact]
    public void BillsListShowsThePatientAndBalance()
    {
        var visit = new Core.Visits.VisitService(_store).Register(new Core.Visits.RegisterVisitInput(
            "org-1", "l1", "2026-10-29", [new Core.Visits.VisitTest("CBC", 300)], ExistingPatient: _store.GetPatient("p1"),
            Payment: new Core.Visits.InitialPayment(100m)));
        var view = new BillsView(_session);
        var window = new Window { Width = 1200, Height = 500, Content = view };
        window.Show();

        var rows = Find<DataGrid>(view, "Grid").ItemsSource.Cast<BillRow>().ToList();
        Assert.Equal(("Asha Rao", 200m), (rows.Single().PatientName, rows.Single().Balance));
        Assert.True(rows.Single().Provisional);
        Assert.Contains("1 shown", Find<TextBlock>(view, "CountText").Text);
    }

    [AvaloniaFact]
    public void TheCashBookTotalsTodaysTakingsByMethod()
    {
        var visits = new Core.Visits.VisitService(_store);
        var p1 = _store.GetPatient("p1");
        visits.Register(new Core.Visits.RegisterVisitInput("org-1", "l1", "2026-10-29", [new Core.Visits.VisitTest("CBC", 300)], ExistingPatient: p1, Payment: new Core.Visits.InitialPayment(300m, "cash")));
        visits.Register(new Core.Visits.RegisterVisitInput("org-1", "l1", "2026-10-29", [new Core.Visits.VisitTest("LFT", 450)], ExistingPatient: p1, Payment: new Core.Visits.InitialPayment(200m, "upi")));

        var view = new CashBookView(_store);
        new Window { Width = 1000, Height = 500, Content = view }.Show();

        Assert.Equal(2, Find<DataGrid>(view, "Grid").ItemsSource.Cast<PaymentRow>().Count());
        var summary = Find<TextBlock>(view, "SummaryText").Text!;
        Assert.Contains("Total 500", summary);
        Assert.Contains("cash 300", summary);
        Assert.Contains("upi 200", summary);
    }

    [AvaloniaFact]
    public void ARemovedTestNoLongerCounts()
    {
        var (_, view) = Show();
        var search = Find<TextBox>(view, "TestSearch");
        foreach (var term in new[] { "cbc", "liver" })
        {
            Type(search, term);
            Press(search, Key.Enter);
        }
        var grid = Find<DataGrid>(view, "SelectedGrid");
        grid.SelectedIndex = 0;
        grid.RaiseEvent(new KeyEventArgs { RoutedEvent = InputElement.KeyDownEvent, Key = Key.Delete });
        Assert.Equal("Total 450", Find<TextBlock>(view, "TotalText").Text);
    }

    [AvaloniaFact]
    public void APackageSetsThePackagePriceAndAddsItsTests()
    {
        var (_, view) = Show();
        var package = Find<ComboBox>(view, "PackageBox");
        package.SelectedIndex = 1;
        Assert.Equal("Total 600", Find<TextBlock>(view, "TotalText").Text);
        Assert.Equal(2, Find<DataGrid>(view, "SelectedGrid").ItemsSource.Cast<object>().Count());
        package.SelectedIndex = 0;
        Assert.Equal("Total 0", Find<TextBlock>(view, "TotalText").Text);
    }

    [AvaloniaFact]
    public void ExistingPatientMustBePickedAndTestsAreRequired()
    {
        var (_, view) = Show();
        var save = Find<Button>(view, "SaveButton");
        save.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        Assert.Contains("Pick a patient", Find<TextBlock>(view, "ResultText").Text);

        view.UsePatient(_store.GetPatient("p1")!);
        save.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        Assert.Contains("at least one test", Find<TextBlock>(view, "ResultText").Text);
        Assert.Null(_store.NextPendingVisit());
    }

    [AvaloniaFact]
    public void TakesAScreenshotForReview()
    {
        var (window, view) = Show();
        view.UsePatient(_store.GetPatient("p1")!);
        var package = Find<ComboBox>(view, "PackageBox");
        package.SelectedIndex = 1;
        var search = Find<TextBox>(view, "TestSearch");
        Type(search, "vitamin"); Press(search, Key.Enter);

        var shot = Environment.GetEnvironmentVariable("LABSHOPE_SHOT_DIR");
        if (shot is null) return;
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        window.CaptureRenderedFrame()!.Save(Path.Combine(shot, "register.png"));
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
