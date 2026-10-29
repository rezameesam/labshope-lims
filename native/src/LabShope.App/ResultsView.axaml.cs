using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>The bench worklist: pick a test, type the result, Enter, next. Works offline.</summary>
public partial class ResultsView : UserControl
{
    private readonly AppSession _session;
    private readonly ResultService _results;
    private WorklistRow? _current;

    /// <summary>Raised after a result is saved so the window can send it.</summary>
    public event Action? ResultSaved;

    public ResultsView() => throw new InvalidOperationException("Use the constructor with a session.");

    public ResultsView(AppSession session)
    {
        _session = session;
        _results = new ResultService(session.Store, session.Workspace.OrganizationId, session.Account.SavedUserId);
        InitializeComponent();
        FilterBox.SelectionChanged += (_, _) => Refresh();
        SearchBox.TextChanged += (_, _) => Refresh();
        Grid.SelectionChanged += (_, _) => Pick(Grid.SelectedItem as WorklistRow);
        Refresh();
    }

    private IReadOnlyCollection<string>? Statuses() => FilterBox.SelectedIndex switch
    {
        0 => ["pending", "in_progress"],
        1 => ["completed"],
        _ => null,
    };

    public void Refresh()
    {
        var keep = _current?.Id;
        var rows = _session.Store.SearchWorklist(SearchBox.Text ?? "", Statuses());
        Grid.ItemsSource = rows;
        CountText.Text = $"{rows.Count} test(s)";
        if (keep is not null) Grid.SelectedItem = rows.FirstOrDefault(r => r.Id == keep);
    }

    private void Pick(WorklistRow? row)
    {
        _current = row;
        MessageText.Text = "";
        var on = row is not null;
        ValueBox.IsEnabled = UnitBox.IsEnabled = AbnormalBox.IsEnabled = SaveButton.IsEnabled = on;
        if (row is null) { EntryHeading.Text = "Select a test"; RangeText.Text = ""; return; }

        var (unit, range) = _results.Defaults(row.TestName);
        EntryHeading.Text = $"{row.PatientName} - {row.TestName}";
        RangeText.Text = range is null ? "No reference range set for this test." : $"Normal range: {range}" + (unit is null ? "" : $" {unit}");
        ValueBox.Text = row.Test.ResultValue is { } v ? v.ToString("0.##") : row.Test.Result ?? "";
        UnitBox.Text = row.Test.ResultUnit ?? unit ?? "";
        AbnormalBox.IsChecked = row.Test.IsAbnormal;
        ValueBox.Focus();
        ValueBox.SelectAll();
    }

    private void OnSave(object? sender, RoutedEventArgs e)
    {
        if (_current is null) return;
        try
        {
            var saved = _results.Enter(_current.Id, ValueBox.Text ?? "", UnitBox.Text, AbnormalBox.IsChecked == true);
            var next = NextAfter(_current.Id);
            Refresh();
            MessageText.Text = "";
            EntryHeading.Text = saved.IsAbnormal ? $"Saved ({saved.TestName}): ABNORMAL" : $"Saved ({saved.TestName})";
            if (next is not null) Grid.SelectedItem = ((IReadOnlyList<WorklistRow>)Grid.ItemsSource!).FirstOrDefault(r => r.Id == next);
            ResultSaved?.Invoke();
        }
        catch (ArgumentException ex) { MessageText.Text = ex.Message; }
    }

    /// <summary>The test that follows the one just saved, so the next entry can start straight away.</summary>
    private string? NextAfter(string id)
    {
        var rows = (IReadOnlyList<WorklistRow>?)Grid.ItemsSource;
        if (rows is null) return null;
        var i = rows.ToList().FindIndex(r => r.Id == id);
        return i >= 0 && i + 1 < rows.Count ? rows[i + 1].Id : null;
    }
}
