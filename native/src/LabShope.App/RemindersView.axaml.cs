using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Patient reminders (follow-ups, checkups, payments), shared with the website. Needs an internet connection.</summary>
public partial class RemindersView : UserControl
{
    private readonly AppSession _session;
    private List<ReminderRow> _all = [];

    public RemindersView() => throw new InvalidOperationException("Use the constructor with a session.");

    public RemindersView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        FilterBox.SelectionChanged += (_, _) => Apply();
        Grid.SelectionChanged += (_, _) => UpdateButtons();
        UpdateButtons();
        Opened();
    }

    private async void Opened() => await RefreshAsync();

    public async Task RefreshAsync()
    {
        if (_session.Api is null) { MessageText.Text = "Reminders need an internet connection."; return; }
        MessageText.Text = "";
        var (items, error) = await Reminders.LoadAsync(_session.Api, _session.Workspace.OrganizationId);
        if (error is not null) { MessageText.Text = error; return; }
        var today = DateOnly.FromDateTime(DateTime.Today);
        _all = items.Select(r => new ReminderRow(r, _session.Store.GetPatient(r.PatientId)?.FullName ?? "Unknown patient", today)).ToList();
        Apply();
    }

    private void Apply()
    {
        var filter = (FilterBox.SelectedItem as ComboBoxItem)?.Content as string ?? "To do";
        var rows = ReminderRow.Filter(_all, filter).ToList();
        Grid.ItemsSource = rows;
        var overdue = _all.Count(r => r.Reminder.IsOverdue(r.Today));
        SummaryText.Text = $"{_all.Count(r => !r.Done)} to do" + (overdue > 0 ? $", {overdue} overdue" : "");
        UpdateButtons();
    }

    private void UpdateButtons()
    {
        var row = Grid.SelectedItem as ReminderRow;
        DoneButton.IsEnabled = EditButton.IsEnabled = DeleteButton.IsEnabled = row is not null;
        DoneButton.Content = row?.Done == true ? "Mark not done" : "Mark done";
    }

    private async void OnRefresh(object? sender, RoutedEventArgs e) => await RefreshAsync();

    private async void OnAdd(object? sender, RoutedEventArgs e)
    {
        var dialog = new ReminderDialog(_session);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved) { await RefreshAsync(); MessageText.Text = "Reminder added."; }
    }

    private async void OnEdit(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not ReminderRow row) return;
        var dialog = new ReminderDialog(_session, row.Reminder);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved) { await RefreshAsync(); MessageText.Text = "Reminder changed."; }
    }

    public async Task SetDoneAsync(ReminderRow row, bool done)
    {
        if (_session.Api is null) { MessageText.Text = "Reminders need an internet connection."; return; }
        var r = await Reminders.SetDoneAsync(_session.Api, _session.Workspace.OrganizationId, row.Id, done, DateTimeOffset.UtcNow);
        if (r.Ok) await RefreshAsync();
        MessageText.Text = r.Ok ? (done ? "Marked done." : "Marked not done.") : r.Error;
    }

    private async void OnDone(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is ReminderRow row) await SetDoneAsync(row, !row.Done);
    }

    public async Task DeleteAsync(ReminderRow row)
    {
        if (_session.Api is null) { MessageText.Text = "Reminders need an internet connection."; return; }
        var r = await Reminders.DeleteAsync(_session.Api, _session.Workspace.OrganizationId, row.Id);
        if (r.Ok) await RefreshAsync();
        MessageText.Text = r.Ok ? "Reminder deleted." : r.Error;
    }

    private async void OnDelete(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not ReminderRow row) return;
        var ok = await ConfirmDialog.AskAsync((Window)TopLevel.GetTopLevel(this)!, "Delete reminder", $"Delete \"{row.Title}\"? This cannot be undone.", "Delete");
        if (ok) await DeleteAsync(row);
    }
}
