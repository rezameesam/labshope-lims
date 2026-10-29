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
        Refresh();
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
        DataLine.Text = AppConfig.DataDirectory;
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
}
