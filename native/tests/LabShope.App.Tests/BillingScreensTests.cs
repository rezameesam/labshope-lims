using System.Net;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.App.Tests;

public class BillingScreensTests : IDisposable
{
    private sealed class Server : HttpMessageHandler
    {
        public List<(string Method, string Url, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content is null ? "" : await r.Content.ReadAsStringAsync(ct);
            Calls.Add((r.Method.Method, r.RequestUri!.PathAndQuery, body));
            var path = r.RequestUri.AbsolutePath;
            string json = path.EndsWith("invoice_items") && r.Method == HttpMethod.Get ? """[{"id":"i1","test_name":"CBC","unit_price":100,"quantity":1,"amount":100},{"id":"i2","test_name":"TSH","unit_price":200,"quantity":1,"amount":200}]"""
                : path.EndsWith("/payments") ? """[{"id":"pay1","amount":100,"payment_method":"cash","payment_date":"2026-10-29T10:05:00Z","transaction_id":null,"notes":null,"received_by":"u-1"}]"""
                : path.EndsWith("billing_audit") ? """[{"changed_at":"2026-10-29T10:05:00Z","changed_by":"u-1","action":"payment_recorded","old_values":null,"new_values":{"amount":100,"payment_method":"cash"}}]"""
                : path.EndsWith("/employees") ? """[{"user_id":"u-1","full_name":"Asha Rao"}]"""
                : """[{"id":"x"}]""";
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
        }
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-bills-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly Server _server = new();
    private readonly AppSession _session;

    public BillingScreensTests()
    {
        _store = new LocalStore(_path);
        var api = new SupabaseApi(new HttpClient(_server), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u-1", "a@b.c") };
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store, new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"), api);
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Asha Rao", "9876543210", "female", null));
        _store.UpsertPatient(new Patient("p2", "IRM-0002", "Ravi Kumar", "9811111111", "male", null));
        _store.UpsertInvoice(new Invoice("inv-1", "INV-1", "p1", 300m, 100m, "partial", "2026-10-29T10:00:00+00:00", 0m));
        _store.UpsertInvoice(new Invoice("inv-2", "INV-2", "p2", 500m, 500m, "paid", "2026-10-20T10:00:00+00:00", 0m));
        _store.UpsertInvoice(new Invoice("inv-3", "INV-3", "p2", 200m, 0m, "pending", "2026-10-29T12:00:00+00:00", 0m));
    }

    /// <summary>Lets the window build its rows (a list only creates its row controls once laid out).</summary>
    private static void Settle(Window window)
    {
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        window.Measure(new Avalonia.Size(window.Width, window.Height));
        window.Arrange(new Avalonia.Rect(0, 0, window.Width, window.Height));
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
    }

    private static BillRow Row(string id, decimal total, decimal paid, string status, decimal discount = 0m) =>
        new(id, "INV-1", "p1", "Asha Rao", "IRM-0001", total, paid, status, "2026-10-29T10:00:00+00:00", discount);

    [AvaloniaFact]
    public async Task TheDetailsShowItemsPaymentsWithWhoTookThemAndTheHistory()
    {
        var dialog = new BillDetailsDialog(_session.Api, "org-1", _store, Row("inv-1", 300m, 100m, "partial"));
        dialog.Show();
        for (var i = 0; i < 200 && dialog.FindControl<DataGrid>("ItemGrid")!.ItemsSource is null; i++) { await Task.Delay(20); Avalonia.Threading.Dispatcher.UIThread.RunJobs(); }

        Assert.Equal(["CBC", "TSH"], dialog.FindControl<DataGrid>("ItemGrid")!.ItemsSource!.Cast<BillItem>().Select(x => x.TestName));
        Assert.Equal("Asha Rao", dialog.FindControl<DataGrid>("PaymentGrid")!.ItemsSource!.Cast<BillPayment>().Single().ReceivedBy);
        Assert.Equal("100 via cash", dialog.FindControl<DataGrid>("HistoryGrid")!.ItemsSource!.Cast<BillHistoryEntry>().Single().Summary);
        Assert.Contains("Balance 200", dialog.FindControl<TextBlock>("Amounts")!.Text);
    }

    [AvaloniaFact]
    public void OfflineTheDetailsStillShowThePaymentsOnThisPcAndSayWhatIsMissing()
    {
        _store.AddPayment(new LocalPayment("pay-local", "inv-1", 100m, "upi", "UPI-1", null, "2026-10-29T10:05:00Z", false));
        var dialog = new BillDetailsDialog(null, "org-1", _store, Row("inv-1", 300m, 100m, "partial"));
        dialog.Show();

        Assert.Equal(100m, dialog.FindControl<DataGrid>("PaymentGrid")!.ItemsSource!.Cast<BillPayment>().Single().Amount);
        Assert.Contains("internet", dialog.FindControl<TextBlock>("NoticeText")!.Text);
    }

    [AvaloniaFact]
    public async Task EditingAPriceAndTheDiscountUpdatesTheTotalsLiveAndSavesTheBill()
    {
        var dialog = new BillEditDialog(_session.Api!, "org-1", "u-1", true, Row("inv-1", 300m, 100m, "partial"));
        dialog.Show();
        var save = dialog.FindControl<Button>("SaveButton")!;
        for (var i = 0; i < 200 && !save.IsEnabled; i++) { await Task.Delay(20); Avalonia.Threading.Dispatcher.UIThread.RunJobs(); }
        Assert.True(save.IsEnabled);
        Assert.Equal("300", dialog.FindControl<TextBlock>("SubtotalText")!.Text);

        Settle(dialog);
        var firstPrice = dialog.GetVisualDescendants().OfType<TextBox>().First(t => t.Text == "100");
        firstPrice.Text = "150";
        dialog.FindControl<TextBox>("DiscountBox")!.Text = "50";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal("350", dialog.FindControl<TextBlock>("SubtotalText")!.Text);
        Assert.Equal("300", dialog.FindControl<TextBlock>("FinalText")!.Text);

        save.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        for (var i = 0; i < 200 && dialog.Saved is null; i++) { await Task.Delay(20); Avalonia.Threading.Dispatcher.UIThread.RunJobs(); }

        Assert.NotNull(dialog.Saved);
        Assert.Equal((300m, 50m, "partial"), (dialog.Saved!.TotalAmount, dialog.Saved.Discount, dialog.Saved.PaymentStatus));
        Assert.Contains(_server.Calls, c => c.Method == "PATCH" && c.Url.Contains("invoice_items?id=eq.i1") && c.Body.Contains("\"amount\":150"));
        Assert.Contains(_server.Calls, c => c.Method == "PATCH" && c.Url.Contains("invoices?id=eq.inv-1") && c.Body.Contains("\"final_amount\":300"));
    }

    [AvaloniaFact]
    public async Task ABadPriceIsExplainedAndNothingIsSent()
    {
        var dialog = new BillEditDialog(_session.Api!, "org-1", "u-1", true, Row("inv-1", 300m, 100m, "partial"));
        dialog.Show();
        var save = dialog.FindControl<Button>("SaveButton")!;
        for (var i = 0; i < 200 && !save.IsEnabled; i++) { await Task.Delay(20); Avalonia.Threading.Dispatcher.UIThread.RunJobs(); }
        Settle(dialog);
        dialog.GetVisualDescendants().OfType<TextBox>().First(t => t.Text == "100").Text = "abc";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        save.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

        Assert.Contains("every price", dialog.FindControl<TextBlock>("ErrorText")!.Text);
        Assert.DoesNotContain(_server.Calls, c => c.Method == "PATCH");
    }

    [AvaloniaFact]
    public void BillsCanBeFilteredByStatusAndDateAndTheSummaryFollows()
    {
        var view = new BillsView(_session);
        new Window { Width = 1300, Height = 800, Content = view }.Show();
        var summary = view.FindControl<TextBlock>("SummaryText")!;
        Assert.Contains("3 bill(s)", summary.Text);
        Assert.Contains("billed 1000", summary.Text);

        view.FindControl<ComboBox>("StatusBox")!.SelectedIndex = 3; // paid
        Assert.Equal(["INV-2"], view.FindControl<DataGrid>("Grid")!.ItemsSource!.Cast<BillRow>().Select(b => b.InvoiceNumber));

        view.FindControl<ComboBox>("StatusBox")!.SelectedIndex = 0;
        view.FindControl<CalendarDatePicker>("FromBox")!.SelectedDate = new DateTime(2026, 10, 28); // since the 28th: leaves the old paid bill out
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(2, view.FindControl<DataGrid>("Grid")!.ItemsSource!.Cast<BillRow>().Count());
        Assert.Contains("still to collect 400", summary.Text); // 200 + 200
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
    }
}
