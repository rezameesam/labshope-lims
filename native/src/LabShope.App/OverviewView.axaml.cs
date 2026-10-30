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
        ShowTrends(LabShope.Core.Visits.OverviewTrends.Build(_session.Store, DateOnly.FromDateTime(DateTime.Today)));
    }

    private void ShowTrends(LabShope.Core.Visits.Trends t)
    {
        MoneySummary.Text = $"Billed {Money(t.TotalBilled)}  ·  collected {Money(t.TotalCollected)}";
        TestsSummary.Text = $"{t.TotalTests} test(s)";
        var blue = (Avalonia.Media.IBrush)Avalonia.Application.Current!.FindResource("PrimaryBrush")!;
        var green = (Avalonia.Media.IBrush)Avalonia.Application.Current!.FindResource("SuccessBrush")!;
        Bars(MoneyChart, t.Days, [(blue, d => (double)d.Billed), (green, d => (double)d.Collected)]);
        Bars(TestsChart, t.Days, [(blue, d => d.Tests)]);

        TopEmpty.IsVisible = t.TopTests.Count == 0;
        var max = Math.Max(1, t.TopTests.Select(x => x.Count).DefaultIfEmpty(1).Max());
        TopTests.ItemsSource = t.TopTests.Select(x => (Control)new StackPanel
        {
            Spacing = 2,
            Children =
            {
                new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Children = { new TextBlock { Text = x.Name, TextTrimming = Avalonia.Media.TextTrimming.CharacterEllipsis }, new TextBlock { Text = x.Count.ToString(), [Grid.ColumnProperty] = 1 } } },
                new Border { Height = 5, CornerRadius = new Avalonia.CornerRadius(3), Background = blue, HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left, Width = 250.0 * x.Count / max },
            },
        }).ToList();
    }

    /// <summary>Draws one column group per day; each series is a bar as tall as its value relative to the biggest value shown.</summary>
    private static void Bars(Grid chart, IReadOnlyList<LabShope.Core.Visits.TrendDay> days, (Avalonia.Media.IBrush Brush, Func<LabShope.Core.Visits.TrendDay, double> Value)[] series)
    {
        chart.Children.Clear();
        chart.ColumnDefinitions = new ColumnDefinitions(string.Join(",", days.Select(_ => "*")));
        var max = Math.Max(1.0, days.SelectMany(d => series.Select(s => s.Value(d))).DefaultIfEmpty(1).Max());
        for (var i = 0; i < days.Count; i++)
        {
            var group = new StackPanel { Orientation = Avalonia.Layout.Orientation.Horizontal, Spacing = 1, VerticalAlignment = Avalonia.Layout.VerticalAlignment.Bottom, HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center, [Grid.ColumnProperty] = i };
            foreach (var (brush, value) in series)
                group.Children.Add(new Border { Width = series.Length == 1 ? 10 : 5, Height = Math.Max(2, 118 * value(days[i]) / max), Background = brush, VerticalAlignment = Avalonia.Layout.VerticalAlignment.Bottom });
            Avalonia.Controls.ToolTip.SetTip(group, $"{days[i].Label}: billed {days[i].Billed:0.##}, collected {days[i].Collected:0.##}, {days[i].Tests} test(s)");
            chart.Children.Add(group);
        }
    }

    private static string Money(decimal v) => v.ToString("#,##0.##").Length == 0 ? "0" : v.ToString("#,##0.##");

    private void OnRegister(object? sender, RoutedEventArgs e) => RegisterRequested?.Invoke();
    private void OnResults(object? sender, RoutedEventArgs e) => ResultsRequested?.Invoke();
    private void OnBills(object? sender, RoutedEventArgs e) => BillsRequested?.Invoke();
}
