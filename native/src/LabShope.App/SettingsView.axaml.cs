using System.Diagnostics;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Sync;

namespace LabShope.App;

/// <summary>Sync state, anything the server refused (with the reason, and Retry/Discard), and account details.</summary>
public partial class SettingsView : UserControl
{
    private readonly AppSession _session;
    private SyncStatus? _status;

    /// <summary>Raised when the user asks for a sync (or retries something) so the window can run it.</summary>
    public event Action? SyncRequested;

    /// <summary>Raised after Retry/Discard so other screens refresh.</summary>
    public event Action? QueueChanged;

    public SettingsView() => throw new InvalidOperationException("Use the constructor with a session.");

    public SettingsView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        QueueGrid.SelectionChanged += (_, _) => UpdateButtons();
        LabProfileButton.IsVisible = _session.Api is not null && _session.Workspace.IsAdmin;
        LoadPrinter();
        Refresh();
    }

    private void LoadPrinter()
    {
        var p = LabShope.Core.Printing.PrinterSettings.Load(_session.Store);
        PrinterSerial.ItemsSource = System.IO.Ports.SerialPort.GetPortNames().OrderBy(n => n).ToList();
        PrinterMode.SelectedIndex = (int)p.Mode;
        PrinterHost.Text = p.Host;
        PrinterPort.Text = p.Port.ToString();
        PrinterSerial.SelectedItem = p.SerialPort.Length > 0 ? p.SerialPort : null;
        PrinterBaud.Text = p.SerialBaud.ToString();
        PrinterWidth.SelectedIndex = p.Columns <= 36 ? 1 : 0;
        ShowPrinterFields();
    }

    private void OnPrinterModeChanged(object? sender, SelectionChangedEventArgs e) => ShowPrinterFields();

    private void ShowPrinterFields()
    {
        var mode = (LabShope.Core.Printing.PrinterMode)Math.Max(PrinterMode.SelectedIndex, 0);
        HostLabel.IsVisible = HostRow.IsVisible = mode == LabShope.Core.Printing.PrinterMode.Network;
        SerialLabel.IsVisible = SerialRow.IsVisible = mode == LabShope.Core.Printing.PrinterMode.Serial;
        TestPrinterButton.IsVisible = mode != LabShope.Core.Printing.PrinterMode.Browser;
    }

    private LabShope.Core.Printing.PrinterSettings ReadPrinter() => new(
        (LabShope.Core.Printing.PrinterMode)Math.Max(PrinterMode.SelectedIndex, 0), (PrinterHost.Text ?? "").Trim(),
        int.TryParse(PrinterPort.Text, out var port) ? port : 0, PrinterSerial.SelectedItem as string ?? "",
        int.TryParse(PrinterBaud.Text, out var baud) ? baud : 0, PrinterWidth.SelectedIndex == 1 ? 32 : LabShope.Core.Printing.EscPos.DefaultColumns);

    private void ShowPrinterMessage(string text, bool ok)
    {
        PrinterMessage.Text = text;
        PrinterMessage.Foreground = (Avalonia.Media.IBrush)Avalonia.Application.Current!.FindResource(ok ? "SuccessBrush" : "DangerBrush")!;
    }

    private void OnSavePrinter(object? sender, RoutedEventArgs e)
    {
        var settings = ReadPrinter();
        if (settings.Problem() is { } problem) { ShowPrinterMessage(problem, false); return; }
        settings.Save(_session.Store);
        ShowPrinterMessage(settings.Mode == LabShope.Core.Printing.PrinterMode.Browser ? "Saved. Receipts open in the browser." : "Saved. Receipts now print straight to the printer.", true);
    }

    private async void OnTestPrinter(object? sender, RoutedEventArgs e)
    {
        var settings = ReadPrinter();
        if (settings.Problem() is { } problem) { ShowPrinterMessage(problem, false); return; }
        TestPrinterButton.IsEnabled = false;
        ShowPrinterMessage("Printing…", true);
        var outcome = await LabShope.Core.Printing.RawPrinter.SendAsync(settings, LabShope.Core.Printing.EscPos.TestPage(_session.Workspace.OrganizationName, settings.Columns));
        ShowPrinterMessage(outcome.Ok ? "Sent. If a page came out with a full-width line of = signs, the width is right." : outcome.Error!, outcome.Ok);
        TestPrinterButton.IsEnabled = true;
    }

    public void ShowStatus(SyncStatus status) { _status = status; Refresh(); }

    public void Refresh()
    {
        var queue = _session.Store.ListOutbox();
        var failed = queue.Count(e => e.Status == "failed");
        QueueGrid.ItemsSource = queue;
        QueueEmpty.IsVisible = queue.Count == 0;
        QueueGrid.IsVisible = queue.Count > 0;
        QueueTitle.Text = failed > 0 ? $"Needs attention ({failed} refused, {queue.Count - failed} waiting)" : queue.Count > 0 ? $"Waiting to be sent ({queue.Count})" : "Waiting to be sent";
        UpdateButtons();

        var s = _status;
        SyncLine.Text = s is null ? "Not synced yet in this session."
            : s.NeedsSignIn ? "Your sign-in has ended. Sign out and sign in again."
            : s.Online ? $"Connected. Last synced {(s.LastSyncedAt?.ToLocalTime().ToString("HH:mm") ?? "just now")}."
            : "Offline. Everything you do is saved on this PC and sent when the connection returns.";
        SyncSub.Text = s?.Error is { Length: > 0 } err ? $"Last problem: {err}" : "";

        UserLine.Text = _session.Account.SavedEmail ?? "";
        LabLine.Text = _session.Workspace.OrganizationName;
        RoleLine.Text = _session.Workspace.Roles is { Count: > 0 } roles ? string.Join(", ", roles) : "";
        VersionLine.Text = System.Reflection.Assembly.GetEntryAssembly()?.GetName().Version?.ToString(3) ?? "";
        var latest = LabShope.Core.Data.DatabaseGuard.Backups(System.IO.Path.Combine(AppConfig.DataDirectory, "backups", _session.Workspace.OrganizationId)).OrderByDescending(f => f).FirstOrDefault();
        DataLine.Text = AppConfig.DataDirectory + (latest is null ? "" : $"   ·   last backup {LabShope.Core.Data.Dates.DateTime(System.IO.File.GetLastWriteTime(latest))}")
            + (string.IsNullOrEmpty(_session.Store.GetMeta("notify_last_error")) ? "" : $"\nThe last patient email could not be sent: {_session.Store.GetMeta("notify_last_error")}");
    }

    private void UpdateButtons()
    {
        var picked = QueueGrid.SelectedItem as OutboxEntry;
        RetryButton.IsEnabled = picked?.Status == "failed";
        DiscardButton.IsEnabled = picked is not null && picked.Status == "failed";
    }

    private void OnSyncNow(object? sender, RoutedEventArgs e) => SyncRequested?.Invoke();

    private void OnRetry(object? sender, RoutedEventArgs e)
    {
        if (QueueGrid.SelectedItem is not OutboxEntry entry) return;
        OutboxAdmin.Retry(_session.Store, entry.Id);
        QueueMessage.Text = "It will be sent again at the next sync.";
        Refresh();
        QueueChanged?.Invoke();
        SyncRequested?.Invoke();
    }

    private async void OnDiscard(object? sender, RoutedEventArgs e)
    {
        if (QueueGrid.SelectedItem is not OutboxEntry entry) return;
        var detail = entry.Kind == "visit"
            ? "The visit, its bill, tests and any payment taken on this computer will be removed. This can't be undone."
            : "This change will be dropped. This can't be undone.";
        if (!await ConfirmDialog.AskAsync((Window)TopLevel.GetTopLevel(this)!, $"Discard this {entry.What.ToLowerInvariant()} for {entry.Who}?", detail, "Discard")) return;

        OutboxAdmin.Discard(_session.Store, entry.Id);
        QueueMessage.Text = "Discarded.";
        Refresh();
        QueueChanged?.Invoke();
    }

    private void OnOpenLogs(object? sender, RoutedEventArgs e)
    {
        var dir = LabShope.Core.AppLog.Directory ?? AppConfig.DataDirectory;
        try { Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true }); } catch { QueueMessage.Text = $"Logs are in {dir}"; }
    }

    /// <summary>Raised after the lab profile changed so the window can fetch the new name and logo for reports and receipts.</summary>
    public event Func<Task>? LabProfileChanged;

    private async void OnLabProfile(object? sender, RoutedEventArgs e)
    {
        if (_session.Api is null) return;
        var dialog = new LabProfileDialog(_session.Api, _session.Workspace.OrganizationId, _session.Account.SavedUserId);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved && LabProfileChanged is not null) await LabProfileChanged.Invoke();
    }
}
