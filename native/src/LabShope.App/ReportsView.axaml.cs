using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using LabShope.Core.Data;

namespace LabShope.App;

/// <summary>Takings, billing and test volumes for a period, worked out from this PC's data (works offline).</summary>
public partial class ReportsView : UserControl
{
    private readonly AppSession _session;
    private string _period = "today";

    public ReportsView() => throw new InvalidOperationException("Use the constructor with a session.");

    public ReportsView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        Refresh();
    }

    private void OnPeriod(object? sender, RoutedEventArgs e)
    {
        _period = (string)((Button)sender!).Tag!;
        Refresh();
    }

    public void Refresh()
    {
        foreach (var (b, key) in new[] { (TodayButton, "today"), (WeekButton, "week"), (MonthButton, "month"), (ThisMonthButton, "thismonth") })
            b.Classes.Set("on", key == _period);

        var today = DateTime.Now.Date;
        var (from, to) = _period switch
        {
            "week" => (today.AddDays(-6), today),
            "month" => (today.AddDays(-29), today),
            "thismonth" => (new DateTime(today.Year, today.Month, 1), today),
            _ => (today, today),
        };
        RangeText.Text = from == to ? from.ToString("d MMM yyyy") : $"{from:d MMM} - {to:d MMM yyyy}";

        var offset = (int)TimeZoneInfo.Local.GetUtcOffset(today).TotalMinutes;
        var r = _session.Store.GetReport(from.ToString("yyyy-MM-dd"), to.ToString("yyyy-MM-dd"), offset);

        BilledValue.Text = Money(r.Billed);
        VisitsSub.Text = $"{r.Visits} visit{(r.Visits == 1 ? "" : "s")}";
        CollectedValue.Text = Money(r.Collected);
        OutstandingValue.Text = Money(r.Outstanding);
        TestsValue.Text = r.TestsOrdered.ToString();
        TestsSub.Text = $"{r.TestsCompleted} completed";

        DrawChart(from, to, r.DailyCollections);
        DrawMethods(r.ByMethod);
        DrawTopTests(r.TopTests);
    }

    private static string Money(decimal v) => v.ToString("#,##0.##").Length == 0 ? "0" : v.ToString("#,##0.##");

    /// <summary>One bar per calendar day (empty days show as a thin stub so the shape of the period is clear).</summary>
    private void DrawChart(DateTime from, DateTime to, IReadOnlyList<DayAmount> data)
    {
        Chart.Children.Clear();
        Chart.ColumnDefinitions.Clear();
        ChartEmpty.IsVisible = data.Count == 0;

        var days = Enumerable.Range(0, (to - from).Days + 1).Select(i => from.AddDays(i)).ToList();
        var amounts = days.ToDictionary(d => d.ToString("yyyy-MM-dd"), _ => 0m);
        foreach (var d in data) amounts[d.Day] = d.Amount;
        var max = Math.Max(amounts.Values.DefaultIfEmpty(0).Max(), 1m);
        var every = Math.Max(1, days.Count / 10);

        for (var i = 0; i < days.Count; i++)
        {
            Chart.ColumnDefinitions.Add(new ColumnDefinition(1, GridUnitType.Star));
            var amount = amounts[days[i].ToString("yyyy-MM-dd")];
            var column = new Grid { RowDefinitions = new RowDefinitions("Auto,*,Auto"), Margin = new Thickness(3, 0) };
            column.Children.Add(new TextBlock { Text = amount > 0 ? Money(amount) : "", FontSize = 10, Foreground = (IBrush)Application.Current!.FindResource("MutedBrush")!, HorizontalAlignment = HorizontalAlignment.Center });
            var bar = new Border
            {
                VerticalAlignment = VerticalAlignment.Bottom,
                HorizontalAlignment = HorizontalAlignment.Center,
                MaxWidth = 56,
                MinWidth = 8,
                Height = Math.Max(2, (double)(amount / max) * 150),
                CornerRadius = new CornerRadius(5, 5, 0, 0),
                Background = amount > 0 ? (IBrush)Application.Current!.FindResource("PrimaryBrush")! : new SolidColorBrush(Color.Parse("#DCE8EF")),
            };
            Grid.SetRow(bar, 1);
            column.Children.Add(bar);
            var label = new TextBlock { Text = i % every == 0 ? days[i].ToString(days.Count > 12 ? "d" : "ddd d") : "", FontSize = 10, Foreground = (IBrush)Application.Current!.FindResource("MutedBrush")!, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 4, 0, 0) };
            Grid.SetRow(label, 2);
            column.Children.Add(label);
            Grid.SetColumn(column, i);
            Chart.Children.Add(column);
        }
    }

    private void DrawMethods(IReadOnlyList<MethodAmount> methods)
    {
        Methods.Children.Clear();
        if (methods.Count == 0) { Methods.Children.Add(new TextBlock { Text = "No payments in this period.", Classes = { "muted" } }); return; }
        var total = Math.Max(methods.Sum(m => m.Amount), 1m);
        foreach (var m in methods) Methods.Children.Add(Bar(m.Method.Replace('_', ' '), $"{Money(m.Amount)}  ({m.Count})", (double)(m.Amount / total)));
    }

    private void DrawTopTests(IReadOnlyList<TestCount> tests)
    {
        TopTests.Children.Clear();
        TopEmpty.IsVisible = tests.Count == 0;
        var max = Math.Max(tests.Select(t => t.Count).DefaultIfEmpty(1).Max(), 1);
        foreach (var t in tests) TopTests.Children.Add(Bar(t.TestName, t.Count.ToString(), (double)t.Count / max));
    }

    /// <summary>A label, a value and a proportional bar underneath.</summary>
    private static Control Bar(string label, string value, double fraction)
    {
        var track = new Border { Height = 8, CornerRadius = new CornerRadius(4), Background = new SolidColorBrush(Color.Parse("#E9F0F4")) };
        var fill = new Border { Height = 8, CornerRadius = new CornerRadius(4), Background = (IBrush)Application.Current!.FindResource("PrimaryBrush")!, HorizontalAlignment = HorizontalAlignment.Left };
        var holder = new Grid { Children = { track, fill } };
        holder.SizeChanged += (_, e) => fill.Width = Math.Max(6, e.NewSize.Width * Math.Clamp(fraction, 0, 1));

        var head = new DockPanel { Children = { new TextBlock { Text = value, FontWeight = FontWeight.SemiBold, [DockPanel.DockProperty] = Dock.Right }, new TextBlock { Text = label } } };
        return new StackPanel { Spacing = 6, Children = { head, holder } };
    }
}
