using System.Net;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;

namespace LabShope.App.Tests;

public class NewBillDialogTests : IDisposable
{
    private sealed class Server : HttpMessageHandler
    {
        public List<(string Method, string Path, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content is null ? "" : await r.Content.ReadAsStringAsync(ct);
            Calls.Add((r.Method.Method, r.RequestUri!.AbsolutePath, body));
            var path = r.RequestUri.AbsolutePath;
            var json = path.EndsWith("/rpc/generate_invoice_number") ? "\"INV-000100\""
                : r.Method == HttpMethod.Get ? "[]" : "";
            return new HttpResponseMessage(r.Method == HttpMethod.Post && !path.Contains("/rpc/") ? HttpStatusCode.Created : HttpStatusCode.OK)
            { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
        }
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-newbill-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly Server _server = new();
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];

    public NewBillDialogTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog([new CatalogTest("c1", "CBC", "CBC", 350m, null), new CatalogTest("c2", "LFT", "LFT", 450m, null)], [], [], [], []));
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "+919876543210", null, null));
        _store.UpsertPatientTest(new PatientTest("t1", "p1", "CBC", "2026-10-30", "completed"));
        _store.UpsertPatientTest(new PatientTest("t2", "p1", "LFT", "2026-10-30", "pending"));
        var api = new SupabaseApi(new HttpClient(_server), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u-1", null) };
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"), api);
    }

    [AvaloniaFact]
    public async Task TheStaffMemberTicksTestsChangesAPriceAndTheBillIsCreated()
    {
        var dialog = new NewBillDialog(_session);
        dialog.Show(); _windows.Add(dialog);
        await dialog.PickAsync(_store.GetPatient("p1")!);

        var list = dialog.FindControl<ItemsControl>("TestList")!;
        var rows = list.ItemsSource!.Cast<BillTestRow>().ToList();
        Assert.Equal(["CBC", "LFT"], rows.Select(r => r.TestName));
        Assert.Equal("350", rows[0].PriceText); // the catalog price
        Assert.True(dialog.FindControl<Button>("SaveButton")!.IsEnabled);

        rows[0].IsSelected = true; rows[1].IsSelected = true; rows[1].PriceText = "400";
        dialog.FindControl<TextBox>("DiscountBox")!.Text = "50";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        dialog.FindControl<Button>("SaveButton")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
        for (var i = 0; i < 200 && dialog.Created is null; i++) await Task.Delay(20);

        Assert.NotNull(dialog.Created);
        Assert.Equal(("INV-000100", 700m, 50m), (dialog.Created!.InvoiceNumber, dialog.Created.TotalAmount, dialog.Created.Discount)); // 350 + 400 - 50
        var invoice = _server.Calls.Single(c => c.Method == "POST" && c.Path.EndsWith("/invoices"));
        Assert.Contains("\"total_amount\":750", invoice.Body);
        Assert.Contains("\"discount_amount\":50", invoice.Body);
    }

    [AvaloniaFact]
    public async Task APatientWithNoTestsSaysSoAndCreatesNothing()
    {
        _store.UpsertPatient(new Patient("p2", "IRM-0008", "Ravi Kumar", "+918888888888", null, null));
        var dialog = new NewBillDialog(_session);
        dialog.Show(); _windows.Add(dialog);
        await dialog.PickAsync(_store.GetPatient("p2")!);

        Assert.Contains("no tests on this computer", dialog.FindControl<TextBlock>("LoadText")!.Text);
        Assert.False(dialog.FindControl<Button>("SaveButton")!.IsEnabled);
        Assert.DoesNotContain(_server.Calls, c => c.Method == "POST");
    }

    public void Dispose()
    {
        foreach (var w in _windows) w.Close();
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_path); } catch { }
    }
}
