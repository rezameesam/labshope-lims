using System.Net;
using System.Net.Sockets;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Interactivity;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Printing;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.App.Tests;

public class PrinterSettingsTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-printer-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly AppSession _session;

    public PrinterSettingsTests()
    {
        _store = new LocalStore(_path);
        var api = new SupabaseApi(new HttpClient(), "https://x.supabase.co", "anon");
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store, new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"));
    }

    private static (TcpListener Listener, int Port, Task<byte[]> Received) FakePrinter()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var received = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            using var ms = new MemoryStream();
            await client.GetStream().CopyToAsync(ms);
            return ms.ToArray();
        });
        return (listener, ((IPEndPoint)listener.LocalEndpoint).Port, received);
    }

    [AvaloniaFact]
    public async Task ThePrinterIsSavedAndATestPageReachesIt()
    {
        var (listener, port, received) = FakePrinter();
        try
        {
            var view = new SettingsView(_session);
            new Window { Content = view }.Show();

            view.FindControl<ComboBox>("PrinterMode")!.SelectedIndex = 1;
            view.FindControl<TextBox>("PrinterHost")!.Text = "127.0.0.1";
            view.FindControl<TextBox>("PrinterPort")!.Text = port.ToString();
            view.FindControl<Button>("SavePrinterButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

            var saved = PrinterSettings.Load(_store);
            Assert.Equal((PrinterMode.Network, "127.0.0.1", port), (saved.Mode, saved.Host, saved.Port));

            view.FindControl<Button>("TestPrinterButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            var bytes = await received.WaitAsync(TimeSpan.FromSeconds(8));
            Assert.Contains("Printer test", System.Text.Encoding.ASCII.GetString(bytes));
        }
        finally { listener.Stop(); }
    }

    [AvaloniaFact]
    public void AnIncompletePrinterIsNotSavedAndTheFieldsFollowTheChosenMode()
    {
        var view = new SettingsView(_session);
        new Window { Content = view }.Show();

        view.FindControl<ComboBox>("PrinterMode")!.SelectedIndex = 1; // network, but no address
        view.FindControl<Button>("SavePrinterButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Assert.Contains("network address", view.FindControl<TextBlock>("PrinterMessage")!.Text);
        Assert.Equal(PrinterMode.Browser, PrinterSettings.Load(_store).Mode); // nothing was saved
        Assert.True(view.FindControl<StackPanel>("HostRow")!.IsVisible);
        Assert.False(view.FindControl<StackPanel>("SerialRow")!.IsVisible);

        view.FindControl<ComboBox>("PrinterMode")!.SelectedIndex = 0;
        Assert.False(view.FindControl<StackPanel>("HostRow")!.IsVisible);
        Assert.False(view.FindControl<Button>("TestPrinterButton")!.IsVisible);
    }

    [AvaloniaFact]
    public async Task AReceiptGoesStraightToTheConfiguredPrinterWithoutOpeningABrowser()
    {
        var (listener, port, received) = FakePrinter();
        try
        {
            new PrinterSettings(PrinterMode.Network, "127.0.0.1", port).Save(_store);
            ReceiptPrinter.Configure(_store);

            ReceiptPrinter.Open(new Receipt("pay-12345678", "INV-7", false, "Asha Rao", 100m, 100m, 100m, 0m, "paid", "cash", DateTimeOffset.UtcNow.ToString("O")), "Demo Lab");

            var text = System.Text.Encoding.ASCII.GetString(await received.WaitAsync(TimeSpan.FromSeconds(8)));
            Assert.Contains("INV-7", text);
            Assert.Contains("PAID IN FULL", text);
        }
        finally { listener.Stop(); }
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
    }
}
