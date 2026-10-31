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
    private OutsourceReport? _outsource;
    private Ledger? _ledger;
    private IReadOnlyList<AccountInfo> _accounts = [];
    private bool _filling;
    private DateOnly _from, _to;
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
        if (_report == "ledger" && _ledger is { } lg) { ReceiptPrinter.OpenHtml("account-ledger", Ledgers.ToHtml(_session.Workspace.OrganizationName, lg, _from, _to, DateTime.Now)); return; }
        if (_report == "out" && _outsource is { } o) { ReceiptPrinter.OpenHtml("outsource-report", OutsourceReports.ToHtml(_session.Workspace.OrganizationName, o, _from, _to, DateTime.Now)); return; }
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
        foreach (var (b, key) in new[] { (TrialButton, "trial"), (PlButton, "pl"), (BsButton, "bs"), (OutButton, "out"), (LedgerButton, "ledger"), (ChartButton, "chart") }) b.Classes.Set("on", key == _report);

        var today = DateOnly.FromDateTime(DateTime.Now);
        var (from, to) = _period switch
        {
            "month" => (new DateOnly(today.Year, today.Month, 1), today),
            "today" => (today, today),
            _ => (FinanceService.FinancialYear(today).Start, today),
        };
        (_from, _to) = (from, to);
        RangeText.Text = from == to ? from.ToString("d MMM yyyy") : $"{from:d MMM yyyy} - {to:d MMM yyyy}";

        if (_session.Api is null) { Show("The books can't be loaded here.", true); return; }
        MessageCard.IsVisible = false;
        Notice("");

        ChartPanel.IsVisible = LedgerPanel.IsVisible = false;
        if (_report is "ledger" or "chart")
        {
            OutsourcePanel.IsVisible = StatementPanel.IsVisible = Body.IsVisible = false;
            TallyChip.IsVisible = false; _statement = null;
            if (_accounts.Count == 0 || _report == "chart")
            {
                var chart = await Ledgers.ChartAsync(_session.Api, _session.Workspace.OrganizationId);
                if (chart.Data is not { } accounts) { Show(chart.Error ?? "Could not load the books.", chart.Offline); return; }
                _accounts = accounts;
            }
            if (_report == "chart")
            {
                ChartPanel.IsVisible = true; PrintButton.IsVisible = false;
                SeedButton.IsVisible = _accounts.Count == 0;
                ChartGrid.ItemsSource = _accounts;
                return;
            }
            LedgerPanel.IsVisible = true; PrintButton.IsVisible = true;
            var keep = (AccountPicker.SelectedItem as AccountInfo)?.Id;
            _filling = true;
            AccountPicker.ItemsSource = _accounts;
            AccountPicker.SelectedItem = _accounts.FirstOrDefault(a => a.Id == keep) ?? _accounts.FirstOrDefault(a => a.IsActive) ?? _accounts.FirstOrDefault();
            _filling = false;
            await LoadLedgerAsync();
            return;
        }
        if (_report == "out")
        {
            var outResult = await OutsourceReports.LoadAsync(_session.Api, _session.Workspace.OrganizationId, from, to);
            if (outResult.Data is not { } o) { Show(outResult.Error ?? "Could not load the report.", outResult.Offline); return; }
            _outsource = o; _statement = null;
            StatementPanel.IsVisible = false; Body.IsVisible = false;
            OutsourcePanel.IsVisible = true; PrintButton.IsVisible = true;
            OutsourceLabGrid.ItemsSource = o.Labs;
            OutsourceTestGrid.ItemsSource = o.Tests;
            OutsourceTotals.Text = $"{o.Tests.Count} tests · cost {o.TotalCost:N2} · billed {o.TotalRevenue:N2} · margin {o.TotalMargin:N2}";
            TallyChip.IsVisible = false;
            return;
        }
        OutsourcePanel.IsVisible = false;

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

    private Window? Owner => TopLevel.GetTopLevel(this) as Window;

    private void Notice(string text) { NoticeText.Text = text; NoticeText.IsVisible = text.Length > 0; }

    private async void OnNewEntry(object? sender, RoutedEventArgs e)
    {
        if (_session.Api is null) return;
        if (_accounts.Count == 0)
        {
            var chart = await Ledgers.ChartAsync(_session.Api, _session.Workspace.OrganizationId);
            if (chart.Data is not { } list) { Show(chart.Error ?? "Could not load the accounts.", chart.Offline); return; }
            _accounts = list;
        }
        if (_accounts.Count(a => a.IsActive) < 2) { Notice("Add at least two accounts first (Chart of accounts)."); return; }
        var dialog = new JournalEntryDialog(_session, _accounts);
        await dialog.ShowDialog(Owner!);
        if (dialog.PostedNumber is { } number) { await LoadAsync(); Notice($"Journal entry {number} posted."); }
    }

    private async void OnAddAccount(object? sender, RoutedEventArgs e)
    {
        var dialog = new AccountDialog(_session);
        await dialog.ShowDialog(Owner!);
        if (dialog.Saved) { await LoadAsync(); Notice("Account created."); }
    }

    private async void OnEditAccount(object? sender, RoutedEventArgs e)
    {
        if (ChartGrid.SelectedItem is not AccountInfo account) { Notice("Select an account first."); return; }
        var dialog = new AccountDialog(_session, account);
        await dialog.ShowDialog(Owner!);
        if (dialog.Saved) { await LoadAsync(); Notice("Account saved."); }
    }

    public async Task ToggleSelectedAsync()
    {
        if (ChartGrid.SelectedItem is not AccountInfo account || _session.Api is null) { Notice("Select an account first."); return; }
        var r = await Bookkeeping.SetAccountActiveAsync(_session.Api, _session.Workspace.OrganizationId, account.Id, !account.IsActive);
        if (!r.Ok) { Notice(r.Error ?? "Could not change the account."); return; }
        await LoadAsync();
        Notice(account.IsActive ? $"{account.Name} switched off." : $"{account.Name} switched on.");
    }

    private async void OnToggleAccount(object? sender, RoutedEventArgs e) => await ToggleSelectedAsync();

    public async Task SeedAsync()
    {
        if (_session.Api is null) return;
        var r = await Bookkeeping.SeedDefaultAccountsAsync(_session.Api, _session.Workspace.OrganizationId);
        if (!r.Ok) { Notice(r.Error ?? "Could not create the default accounts."); return; }
        await LoadAsync();
        Notice("Default accounts created.");
    }

    private async void OnSeed(object? sender, RoutedEventArgs e) => await SeedAsync();

    private async void OnAccountPicked(object? sender, SelectionChangedEventArgs e) { if (!_filling && _report == "ledger") await LoadLedgerAsync(); }

    private async Task LoadLedgerAsync()
    {
        if (AccountPicker.SelectedItem is not AccountInfo account || _session.Api is null) { LedgerGrid.ItemsSource = null; LedgerTotals.Text = ""; return; }
        var result = await Ledgers.LedgerAsync(_session.Api, _session.Workspace.OrganizationId, account, _from, _to);
        if (result.Data is not { } l) { Show(result.Error ?? "Could not load the ledger.", result.Offline); return; }
        _ledger = l;
        LedgerGrid.ItemsSource = l.Lines;
        LedgerTotals.Text = $"{l.Lines.Count} entries · debit {l.TotalDebit:N2} · credit {l.TotalCredit:N2} · balance {l.Closing:N2}";
    }

    private void Show(string message, bool offline)
    {
        MessageText.Text = message;
        MessageCard.IsVisible = true;
        TallyChip.IsVisible = false;
        Body.IsVisible = !offline && Body.IsVisible;
    }
}
