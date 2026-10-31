using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Finance;

namespace LabShope.App;

/// <summary>Posts a journal entry by hand: a quick entry (income, expense, transfer, capital) or a custom one with any number of lines.</summary>
public partial class JournalEntryDialog : Window
{
    private sealed record Kind(string Id, string Label, QuickKind? Quick) { public override string ToString() => Label; }

    private sealed class LineRow
    {
        public required ComboBox Account { get; init; }
        public required TextBox Note { get; init; }
        public required TextBox Debit { get; init; }
        public required TextBox Credit { get; init; }
        public required Control Root { get; init; }
    }

    private readonly AppSession _session;
    private readonly IReadOnlyList<AccountInfo> _accounts;
    private readonly List<LineRow> _rows = [];

    public string? PostedNumber { get; private set; }

    public JournalEntryDialog() => throw new InvalidOperationException("Use the constructor with a session.");

    public JournalEntryDialog(AppSession session, IReadOnlyList<AccountInfo> accounts)
    {
        _session = session;
        _accounts = accounts.Where(a => a.IsActive).ToList();
        InitializeComponent();
        DateBox.SelectedDate = DateTime.Today;
        KindBox.ItemsSource = Bookkeeping.QuickKinds.Select(q => new Kind(q.Id, q.Label, q)).Append(new Kind("custom", "Custom entry (any lines)", null)).ToList();
        AddLine(); AddLine();
        KindBox.SelectedIndex = 0;
    }

    private Kind Current => (Kind)KindBox.SelectedItem!;

    private static bool IsQuick(Kind k) => k.Quick is not null;

    private void OnKindChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (KindBox.SelectedItem is not Kind k) return;
        QuickPanel.IsVisible = IsQuick(k);
        CustomPanel.IsVisible = !IsQuick(k);
        HintText.Text = k.Quick?.Hint ?? "Debits and credits must be equal.";
        if (k.Quick is { } q)
        {
            FromLabel.Text = q.FromLabel; ToLabel.Text = q.ToLabel;
            FromBox.ItemsSource = _accounts.Where(a => q.FromTypes.Contains(a.Type)).ToList();
            ToBox.ItemsSource = _accounts.Where(a => q.ToTypes.Contains(a.Type)).ToList();
            FromBox.SelectedIndex = ToBox.SelectedIndex = -1;
        }
    }

    private void OnAddLine(object? sender, RoutedEventArgs e) => AddLine();

    private void AddLine()
    {
        var account = new ComboBox { ItemsSource = _accounts, DisplayMemberBinding = new Avalonia.Data.Binding("Display"), Width = 260, PlaceholderText = "Account" };
        var note = new TextBox { Watermark = "Note", Width = 150 };
        var debit = new TextBox { Watermark = "Debit", Width = 90 };
        var credit = new TextBox { Watermark = "Credit", Width = 90 };
        var remove = new Button { Content = "Remove" };
        var panel = new StackPanel { Orientation = Avalonia.Layout.Orientation.Horizontal, Spacing = 6, Children = { account, note, debit, credit, remove } };
        var row = new LineRow { Account = account, Note = note, Debit = debit, Credit = credit, Root = panel };
        debit.TextChanged += (_, _) => { if (!string.IsNullOrWhiteSpace(debit.Text)) credit.Text = ""; ShowTotals(); };
        credit.TextChanged += (_, _) => { if (!string.IsNullOrWhiteSpace(credit.Text)) debit.Text = ""; ShowTotals(); };
        remove.Click += (_, _) => { if (_rows.Count > 2) { _rows.Remove(row); LinesPanel.Children.Remove(panel); ShowTotals(); } };
        _rows.Add(row); LinesPanel.Children.Add(panel);
        ShowTotals();
    }

    private static decimal Num(string? text) => decimal.TryParse(text?.Trim(), out var v) ? v : 0m;

    private void ShowTotals()
    {
        if (TotalsText is null) return;
        var d = _rows.Sum(r => Num(r.Debit.Text)); var c = _rows.Sum(r => Num(r.Credit.Text));
        TotalsText.Text = $"Debit {d:N2} · Credit {c:N2}" + (Math.Abs(d - c) < 0.01m && d > 0 ? " · balanced" : "");
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();

    public async Task SaveAsync()
    {
        ErrorBox.IsVisible = false;
        if (_session.Api is null) { Fail("Journal entries need an internet connection."); return; }
        var date = DateOnly.FromDateTime((DateBox.SelectedDate ?? DateTime.Today).Date);
        string description; string? reference; IReadOnlyList<JournalDraftLine> lines;
        if (Current.Quick is not null)
        {
            var (d, l, error) = Bookkeeping.Quick(Current.Id, FromBox.SelectedItem as AccountInfo, ToBox.SelectedItem as AccountInfo, Num(AmountBox.Text));
            if (error is not null) { Fail(error); return; }
            (description, lines, reference) = (d, l, QuickReferenceBox.Text);
        }
        else
        {
            description = DescriptionBox.Text ?? ""; reference = ReferenceBox.Text;
            lines = _rows.Select(r => new JournalDraftLine((r.Account.SelectedItem as AccountInfo)?.Id ?? "", r.Note.Text, Num(r.Debit.Text), Num(r.Credit.Text))).ToList();
        }

        SaveButton.IsEnabled = false;
        var result = await Bookkeeping.PostEntryAsync(_session.Api, _session.Workspace.OrganizationId, date, description, reference, lines);
        SaveButton.IsEnabled = true;
        if (!result.Ok) { Fail(result.Error ?? "Could not post the entry."); return; }
        PostedNumber = result.Detail;
        Close();
    }

    private async void OnSave(object? sender, RoutedEventArgs e) => await SaveAsync();
    private void Fail(string text) { ErrorText.Text = text; ErrorBox.IsVisible = true; }
    public void Pick(string kind) => KindBox.SelectedItem = ((IEnumerable<Kind>)KindBox.ItemsSource!).First(k => k.Id == kind);
    public void ChooseQuick(string fromId, string toId, string amount)
    {
        FromBox.SelectedItem = _accounts.First(a => a.Id == fromId); ToBox.SelectedItem = _accounts.First(a => a.Id == toId); AmountBox.Text = amount;
    }
}
