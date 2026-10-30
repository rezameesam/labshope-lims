using System.Collections.ObjectModel;
using System.ComponentModel;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>One editable line of a panel result; the flag updates as the value is typed.</summary>
public sealed class PanelRow : INotifyPropertyChanged
{
    private string _value = "", _min = "", _max = "";
    public string Name { get; set; } = "";
    public string Unit { get; set; } = "";
    public string RangeText { get; set; } = "";

    public string Value { get => _value; set { _value = value ?? ""; Changed(nameof(Value)); Changed(nameof(Flag)); } }
    public string Min { get => _min; set { _min = value ?? ""; Changed(nameof(Min)); Changed(nameof(Flag)); } }
    public string Max { get => _max; set { _max = value ?? ""; Changed(nameof(Max)); Changed(nameof(Flag)); } }

    public ResultItem ToItem() => new(Name, Value, Unit, Min, Max, RangeText);
    public string Flag => ToItem().IsAbnormal ? "ABNORMAL" : "";
    public static PanelRow From(ResultItem i) => new() { Name = i.Name, Value = i.Value, Unit = i.Unit, Min = i.Min, Max = i.Max, RangeText = i.RangeText };

    public event PropertyChangedEventHandler? PropertyChanged;
    private void Changed(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>The bench worklist: pick a test, type the result, Enter, next. Works offline.</summary>
public partial class ResultsView : UserControl
{
    private readonly AppSession _session;
    private readonly ResultService _results;
    private WorklistRow? _current;
    private readonly ObservableCollection<PanelRow> _panel = [];

    /// <summary>Raised after a result is saved so the window can send it.</summary>
    public event Action? ResultSaved;

    public ResultsView() => throw new InvalidOperationException("Use the constructor with a session.");

    public ResultsView(AppSession session)
    {
        _session = session;
        _results = new ResultService(session.Store, session.Workspace.OrganizationId, session.Account.SavedUserId);
        InitializeComponent();
        PanelGrid.ItemsSource = _panel;
        PanelToggle.IsCheckedChanged += (_, _) => ShowMode();
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

    /// <summary>Shows only this patient's tests (used when the front-desk board sends someone here).</summary>
    public void ShowPatient(Patient patient)
    {
        FilterBox.SelectedIndex = 2; // All
        SearchBox.Text = patient.PatientCode;
        Refresh();
    }

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
        FormPanel.IsVisible = on;
        OutsourceButton.IsVisible = row is not null && row.Test.ExternalLabId is null && row.Test.Status != "completed";
        EmptyPanel.IsVisible = !on;
        if (row is null) { EntryHeading.Text = ""; RangeText.Text = ""; _panel.Clear(); ShowMode(); return; }

        var (unit, range) = _results.Defaults(row.TestName);
        EntryHeading.Text = $"{row.PatientName} - {row.TestName}";
        RangeText.Text = range is null ? "No reference range set for this test." : $"Normal range: {range}" + (unit is null ? "" : $" {unit}");
        ValueBox.Text = row.Test.ResultValue is { } v ? LabShope.Core.Data.ResultFormat.Number(v) : row.Test.Result ?? "";
        UnitBox.Text = row.Test.ResultUnit ?? unit ?? "";
        AbnormalBox.IsChecked = row.Test.IsAbnormal;

        // A panel opens with its saved rows, or the standard rows for the test (CBC), or stays a single value.
        var saved = ResultItem.ParseAll(row.Test.ResultItemsJson);
        var rows = saved.Count > 0 ? saved : PanelDefaults.For(row.TestName);
        _panel.Clear();
        foreach (var i in rows) _panel.Add(PanelRow.From(i));
        PanelToggle.IsChecked = rows.Count > 0;
        ShowMode();
        if (rows.Count == 0) { ValueBox.Focus(); ValueBox.SelectAll(); } else PanelGrid.Focus();
    }

    private void ShowMode()
    {
        var panel = PanelToggle.IsChecked == true;
        PanelPanel.IsVisible = panel;
        SinglePanel.IsVisible = !panel;
        if (panel && _panel.Count == 0) _panel.Add(new PanelRow());
    }

    private void OnPrintReport(object? sender, RoutedEventArgs e)
    {
        if (_current is null) return;
        var report = ReportBuilder.For(_session.Store, _session.Workspace.OrganizationName, _current.Test.PatientId, _current.Test.TestDate, branding: _session.Store.GetBranding(_session.Workspace.OrganizationName), organizationId: _session.Workspace.OrganizationId, labId: _session.Workspace.LabId);
        if (report is null) { MessageText.Text = "No completed results for this patient on that date yet."; return; }
        MessageText.Text = "";
        ReceiptPrinter.OpenHtml($"report-{report.PatientCode}-{report.ReportDate}", ReportHtml.Build(report));
    }

    private async void OnOutsource(object? sender, RoutedEventArgs e)
    {
        if (_current is null) return;
        var labs = _session.Store.GetCatalog().ExternalLabList;
        if (labs.Count == 0) { MessageText.Text = "No external labs are set up. Add them on the LabShope website first."; return; }

        var dialog = new OutsourceDialog(_results, _current.Id, $"{_current.TestName} for {_current.PatientName}", labs);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (!dialog.Sent) return;
        Refresh();
        ResultSaved?.Invoke();
    }

    private void OnAddRow(object? sender, RoutedEventArgs e) => _panel.Add(new PanelRow());

    private void OnSave(object? sender, RoutedEventArgs e)
    {
        if (_current is null) return;
        try
        {
            var saved = PanelToggle.IsChecked == true
                ? _results.EnterPanel(_current.Id, _panel.Select(r => r.ToItem()).ToList(), AbnormalBox.IsChecked == true)
                : _results.Enter(_current.Id, ValueBox.Text ?? "", UnitBox.Text, AbnormalBox.IsChecked == true);
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
