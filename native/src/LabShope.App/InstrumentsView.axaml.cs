using System.Net.Sockets;
using System.Text;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Analyzers;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Connections to the lab's machines, and the results they sent waiting to be checked.</summary>
public partial class InstrumentsView : UserControl
{
    private readonly AppSession _session;
    private readonly InstrumentHost _host;
    private readonly InstrumentInbox _inbox;

    /// <summary>Raised after a result was accepted so other screens (worklist, sidebar) refresh and the result is sent.</summary>
    public event Action? ResultAccepted;

    public InstrumentsView() => throw new InvalidOperationException("Use the constructor with a session.");

    public InstrumentsView(AppSession session, InstrumentHost host)
    {
        _session = session;
        _host = host;
        _inbox = new InstrumentInbox(session.Store, session.Workspace.OrganizationId, session.Account.SavedUserId);
        InitializeComponent();

        PortCombo.ItemsSource = SerialAnalyzer.AvailablePorts();
        var s = InstrumentSettings.Load(session.Store);
        NetworkBox.IsChecked = s.NetworkEnabled; PortBox.Text = s.NetworkPort.ToString();
        SerialBox.IsChecked = s.SerialEnabled; PortCombo.SelectedItem = s.SerialPort; BaudBox.Text = s.SerialBaud.ToString();
        AutoBox.IsChecked = s.AutoAccept;
        AddressText.Text = LocalAddressText();

        FilterBox.SelectionChanged += (_, _) => Refresh();
        Grid.SelectionChanged += (_, _) => ShowDetail();
        host.Changed += Refresh;
        Refresh();
    }

    private static string LocalAddressText()
    {
        var addresses = InstrumentHost.LocalAddresses();
        return addresses.Count == 0 ? "Enter this computer's address in the analyzer's settings." : $"In the analyzer's settings, send results to this computer: {string.Join(" or ", addresses)}";
    }

    public void Refresh()
    {
        var keep = (Grid.SelectedItem as InstrumentEntry)?.Id;
        var rows = _session.Store.ListInstrumentEntries(FilterBox.SelectedIndex == 0 ? "new" : null);
        Grid.ItemsSource = rows;
        InboxEmpty.IsVisible = rows.Count == 0;
        InboxTitle.Text = _session.Store.NewInstrumentCount() is var n and > 0 ? $"Results from machines ({n} to check)" : "Results from machines";
        NetworkStatus.Text = _host.NetworkStatus;
        SerialStatus.Text = _host.SerialStatus;
        if (keep is not null) Grid.SelectedItem = rows.FirstOrDefault(r => r.Id == keep);
        ShowDetail();
    }

    private void ShowDetail()
    {
        var entry = Grid.SelectedItem as InstrumentEntry;
        DetailGrid.IsVisible = DetailTitle.IsVisible = entry is not null;
        DetailGrid.ItemsSource = entry is null ? null : InstrumentInbox.ParseParameters(entry.ParametersJson);
        AcceptButton.IsEnabled = entry?.Status == "new";
        DiscardButton.IsEnabled = entry?.Status == "new";
        if (entry is not null && entry.Status == "new") InboxMessage.Text = entry.Note ?? "";
    }

    private void OnApply(object? sender, RoutedEventArgs e)
    {
        var settings = new InstrumentSettings(
            NetworkBox.IsChecked == true, int.TryParse(PortBox.Text, out var port) ? port : 0,
            SerialBox.IsChecked == true, PortCombo.SelectedItem as string ?? "", int.TryParse(BaudBox.Text, out var baud) ? baud : 0,
            AutoBox.IsChecked == true);
        if (settings.Problem() is { } problem) { SettingsMessage.Text = problem; return; }

        settings.Save(_session.Store);
        _host.Apply(settings);
        SettingsMessage.Text = "Saved.";
    }

    /// <summary>Sends a made-up CBC for a patient to our own listener, to prove the connection works without needing the machine.</summary>
    private async void OnSelfTest(object? sender, RoutedEventArgs e)
    {
        if (NetworkBox.IsChecked != true || !int.TryParse(PortBox.Text, out var port)) { SettingsMessage.Text = "Tick the network option, save, and try again."; return; }
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync("127.0.0.1", port);
            var message = "MSH|^~\\&|TEST|LAB|LIS|LAB|" + DateTime.Now.ToString("yyyyMMddHHmmss") + "||ORU^R01|TEST1|P|2.3.1\rPID|1||TEST||Test^Patient\rOBR|1||TEST-SAMPLE\rOBX|1|NM|WBC^White cells||6.1|10^9/L|3.5-10.0|N|||F\r";
            var stream = client.GetStream();
            byte[] wrapped = [0x0B, .. Encoding.UTF8.GetBytes(message), 0x1C, 0x0D];
            await stream.WriteAsync(wrapped);
            var buffer = new byte[256];
            var read = await stream.ReadAsync(buffer);
            SettingsMessage.Text = read > 0 ? "The listener answered. Connections work. (A test line appears below with no patient, which is expected.)" : "No answer from the listener.";
        }
        catch (Exception ex) when (ex is SocketException or IOException) { SettingsMessage.Text = "Could not connect. Save the settings first, and check nothing else is using that port."; }
    }

    private void OnAccept(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not InstrumentEntry entry) return;
        var outcome = _inbox.Accept(entry.Id);
        InboxMessage.Text = outcome.Message;
        Refresh();
        if (outcome.Ok) ResultAccepted?.Invoke();
    }

    private async void OnDiscard(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not InstrumentEntry entry) return;
        if (!await ConfirmDialog.AskAsync((Window)TopLevel.GetTopLevel(this)!, "Discard this machine result?", "The values are thrown away. The patient's test stays waiting.", "Discard")) return;
        _inbox.Discard(entry.Id);
        Refresh();
    }
}
