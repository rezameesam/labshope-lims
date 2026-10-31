using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;
using LabShope.Core.Finance;

namespace LabShope.App;

/// <summary>The books: trial balance and recent journal entries, read from the server (needs the internet).</summary>
public partial class FinanceView : UserControl
{
    private readonly AppSession _session;
    private string _period = "year";
    private string _report = "trial";
    private Statement? _statement;
    private bool _loadedOnce;

    public FinanceView() => throw new InvalidOperationException("Use the constructor with a session.");

    public FinanceView(AppSession session)
    {
        _session = session;
        InitializeComponent();
    }

    private async void OnReport(object? sender, RoutedEventArgs e) => await ShowReportAsync((string)((Button)sender!).Tag!);

    /// <param name="report">"trial", "pl" (profit and loss) or "bs" (balance sheet)</param>
    public async Task ShowReportAsync(string report) { _report = report; await LoadAsync(); }

    private void OnPrint(object? sender, RoutedEventArgs e)
    {
        if (_statement is not { } s) return;
        ReceiptPrinter.OpenHtml(_report == "pl" ? "profit-and-loss" : "balance-sheet", Statements.ToHtml(_session.Workspace.OrganizationName, s, DateTime.Now));
    }

    private async void OnPeriod(object? sender, RoutedEventArgs e) { _period = (string)((Button)sender!).Tag!; await LoadAsync(); }
    private async void OnRefresh(object? sender, RoutedEventArgs e) => await LoadAsync();

    /// <summary>Loads once when first shown (the books are not kept on this PC).</summary>
    public async Task EnsureLoadedAsync() { if (!_loadedOnce) await LoadAsync(); }

    public async Task LoadAsync()
    {
        _loadedOnce = true;
        foreach (var (b, key) in new[] { (YearButton, "year"), (MonthButton, "month"), (TodayButton, "today") }) b.Classes.Set("on", key == _period);
        foreach (var (b, key) in new[] { (TrialButton, "trial"), (PlButton, "pl"), (BsButton, "bs") }) b.Classes.Set("on", key == _report);

        var today = DateOnly.FromDateTime(DateTime.Now);
        var (from, to) = _period switch
        {
            "month" => (new DateOnly(today.Year, today.Month, 1), today),
            "today" => (today, today),
            _ => (FinanceService.FinancialYear(today).Start, today),
        };
        RangeText.Text = from == to ? from.ToString("d MMM yyyy") : $"{from:d MMM yyyy} - {to:d MMM yyyy}";

        if (_session.Api is null) { Show("The books can't be loaded here.", true); return; }
        MessageCard.IsVisible = false;

        // A balance sheet is the position up to a date, so it adds up everything since the books began.
        var result = await FinanceService.LoadAsync(_session.Api, _session.Workspace.OrganizationId, _report == "bs" ? new DateOnly(2000, 1, 1) : from, to);
        if (result.Data is not { } tb) { Show(result.Error ?? "Could not load the books.", result.Offline); return; }

        _statement = _report switch { "pl" => Statements.ProfitAndLoss(tb.Accounts, from, to), "bs" => Statements.BalanceSheet(tb.Accounts, to), _ => null };
        StatementPanel.IsVisible = _statement is not null;
        Body.IsVisible = _statement is null;
        PrintButton.IsVisible = _statement is not null;
        if (_statement is { } st)
        {
            StatementTitle.Text = st.Title;
            StatementGrid.ItemsSource = st.Lines;
        }
        else
        {
            BalanceGrid.ItemsSource = tb.Accounts;
            EntryGrid.ItemsSource = tb.RecentEntries;
        }
        var (good, text) = _statement is { } x ? (x.Good, x.Summary) : (tb.Tallied, tb.Tallied ? $"Books balance · {tb.TotalDebit:N2}" : $"Out of balance by {Math.Abs(tb.TotalDebit - tb.TotalCredit):N2}");
        TallyChip.IsVisible = true;
        TallyChip.Background = new SolidColorBrush(Color.Parse(good ? "#E3F5EC" : "#FDE8E8"));
        TallyText.Foreground = new SolidColorBrush(Color.Parse(good ? "#1E8E5A" : "#C53030"));
        TallyText.Text = text;
    }

    private void Show(string message, bool offline)
    {
        MessageText.Text = message;
        MessageCard.IsVisible = true;
        TallyChip.IsVisible = false;
        Body.IsVisible = !offline && Body.IsVisible;
    }
}
