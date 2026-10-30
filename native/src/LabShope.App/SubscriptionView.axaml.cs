using System.Diagnostics;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>The lab's plan and how long it runs. Paying or changing plan happens on the website.</summary>
public partial class SubscriptionView : UserControl
{
    private readonly AppSession _session;

    public SubscriptionView() => throw new InvalidOperationException("Use the constructor with a session.");

    public SubscriptionView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        Show();
    }

    public void Show()
    {
        var info = SubscriptionService.Cached(_session.Store);
        if (info is null)
        {
            StatusText.Text = "Unknown";
            PlanText.Text = UntilText.Text = "";
            CheckedText.Text = "Not checked yet. Connect to the internet and press Check again.";
            return;
        }
        StatusText.Text = info.IsComplimentary ? "Complimentary" : char.ToUpper(info.Status[0]) + info.Status[1..];
        var key = info.IsComplimentary ? "completed" : info.Status switch { "active" => "completed", "trial" => "pending", _ => "failed" };
        StatusPill.Background = (Avalonia.Media.IBrush)Pills.Background.Convert(key, typeof(Avalonia.Media.IBrush), null, System.Globalization.CultureInfo.InvariantCulture)!;
        StatusText.Foreground = (Avalonia.Media.IBrush)Pills.Foreground.Convert(key, typeof(Avalonia.Media.IBrush), null, System.Globalization.CultureInfo.InvariantCulture)!;
        PlanText.Text = char.ToUpper(info.PlanCode[0]) + info.PlanCode[1..].Replace('_', ' ');
        var end = info.IsComplimentary ? info.ComplimentaryUntil : info.Status == "trial" ? info.TrialEndsAt : info.PlanExpiresAt;
        UntilText.Text = end is { } e ? Dates.Date(e.ToLocalTime().DateTime) : info.IsComplimentary ? "No end date" : "No end date set";
        CheckedText.Text = "From the last time this computer was online.";
        var notice = SubscriptionService.Notice(info, DateTimeOffset.Now);
        NoticeCard.IsVisible = notice is not null;
        NoticeText.Text = notice?.Text ?? "";
    }

    public async Task RefreshAsync()
    {
        if (_session.Api is null) { MessageText.Text = "Checking the plan needs an internet connection."; return; }
        try { await SubscriptionService.RefreshAsync(_session.Api, _session.Store, _session.Workspace.OrganizationId, force: true); MessageText.Text = ""; }
        catch (Exception ex) when (ex is Core.Sync.SyncException or HttpRequestException) { MessageText.Text = "Could not reach the server. Try again when you are online."; }
        Show();
    }

    private async void OnRefresh(object? sender, RoutedEventArgs e) => await RefreshAsync();

    private void OnManage(object? sender, RoutedEventArgs e)
    {
        var host = _session.Store.GetMeta("portal_host") ?? _session.Workspace.Slug + ".labshope.com";
        try { Process.Start(new ProcessStartInfo($"https://{host}/admin") { UseShellExecute = true }); }
        catch { MessageText.Text = $"Open https://{host}/admin in your browser."; }
    }
}
