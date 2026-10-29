using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;

namespace LabShope.App;

/// <summary>The home screen: today's numbers at a glance, recent bills, quick actions. All from this PC, so it opens instantly.</summary>
public partial class OverviewView : UserControl
{
    private readonly AppSession _session;

    public event Action? RegisterRequested, ResultsRequested, BillsRequested;

    public OverviewView() => throw new InvalidOperationException("Use the constructor with a session.");

    public OverviewView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        Refresh();
    }

    public void Refresh()
    {
        var hour = DateTime.Now.Hour;
        var hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        Greeting.Text = $"{hello}, {_session.Workspace.OrganizationName}";
        DateLine.Text = DateTime.Now.ToString("dddd, d MMMM yyyy");

        var start = DateTime.Now.Date;
        var from = new DateTimeOffset(start, TimeZoneInfo.Local.GetUtcOffset(start)).UtcDateTime;
        var d = _session.Store.GetDashboard(from.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), from.AddDays(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));

        VisitsValue.Text = d.VisitsToday.ToString();
        TestsValue.Text = d.TestsToDo.ToString();
        TakingsValue.Text = Money(d.TakingsToday);
        UnpaidValue.Text = Money(d.UnpaidBalance);
        UnpaidSub.Text = d.UnpaidBills == 0 ? "everything is paid" : $"across {d.UnpaidBills} bill{(d.UnpaidBills == 1 ? "" : "s")}";

        AttentionCard.IsVisible = d.NeedAttention > 0;
        AttentionText.Text = $"{d.NeedAttention} item{(d.NeedAttention == 1 ? "" : "s")} could not be sent to the server and need attention. Your other work is not affected.";

        // Subscription notice (trial ending, suspended...), from what was last read from the server.
        var notice = LabShope.Core.Visits.SubscriptionService.Notice(LabShope.Core.Visits.SubscriptionService.Cached(_session.Store), DateTimeOffset.Now);
        PlanCard.IsVisible = notice is not null;
        if (notice is not null)
        {
            var (fg, bg, border, icon) = notice.Level switch
            {
                LabShope.Core.Visits.NoticeLevel.Danger => ("#C53030", "#FDE8E8", "#F4B4B4", Material.Icons.MaterialIconKind.AlertCircleOutline),
                LabShope.Core.Visits.NoticeLevel.Warning => ("#B7791F", "#FFF8E6", "#F2D488", Material.Icons.MaterialIconKind.ClockAlertOutline),
                _ => ("#0B81B7", "#E7F3F9", "#B8DCEC", Material.Icons.MaterialIconKind.InformationOutline),
            };
            PlanCard.Background = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse(bg));
            PlanCard.BorderBrush = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse(border));
            PlanIcon.Foreground = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse(fg));
            PlanIcon.Kind = icon;
            PlanText.Text = notice.Text;
        }

        RecentGrid.ItemsSource = _session.Store.SearchBills("", limit: 8);
    }

    private static string Money(decimal v) => v.ToString("#,##0.##").Length == 0 ? "0" : v.ToString("#,##0.##");

    private void OnRegister(object? sender, RoutedEventArgs e) => RegisterRequested?.Invoke();
    private void OnResults(object? sender, RoutedEventArgs e) => ResultsRequested?.Invoke();
    private void OnBills(object? sender, RoutedEventArgs e) => BillsRequested?.Invoke();
}
