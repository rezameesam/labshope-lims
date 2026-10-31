using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Printing;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>
/// The front-desk board: every patient visit with where it has got to (waiting, testing, ready, done), and one clear next step for the selected
/// patient. Built from the tests and bills already on this PC, so it works offline and always agrees with the other screens.
/// </summary>
public partial class FlowView : UserControl
{
    private readonly AppSession _session;
    private readonly ResultService _results;
    private IReadOnlyList<FlowVisit> _all = [];
    private string _stage = "all";

    /// <summary>Raised after tests were started, so the window can send the change.</summary>
    public event Action? Changed;
    public event Action<Patient>? EnterResultsRequested;
    public event Action<Patient>? TakePaymentRequested;
    public event Action<Patient>? RegisterMoreRequested;

    public FlowView() => throw new InvalidOperationException("Use the constructor with a session.");

    public FlowView(AppSession session)
    {
        _session = session;
        _results = new ResultService(session.Store, session.Workspace.OrganizationId, session.Account.SavedUserId);
        InitializeComponent();
        RangeBox.SelectionChanged += (_, _) => Refresh();
        SearchBox.TextChanged += (_, _) => ApplyFilter();
        Grid.SelectionChanged += (_, _) => ShowSelected();
        Refresh();
    }

    private (DateOnly From, DateOnly To) Range()
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        return RangeBox.SelectedIndex switch { 1 => (today.AddDays(-1), today.AddDays(-1)), 2 => (today.AddDays(-6), today), _ => (today, today) };
    }

    public void Refresh()
    {
        var keep = (Grid.SelectedItem as FlowVisit)?.Key;
        var (from, to) = Range();
        _all = VisitFlow.Build(_session.Store, from, to);
        UpdateChips();
        ApplyFilter();
        if (keep is not null && Grid.ItemsSource is IEnumerable<FlowVisit> shown) Grid.SelectedItem = shown.FirstOrDefault(v => v.Key == keep);
        ShowSelected();
    }

    /// <summary>Jumps to a patient's visits (used when another screen sends someone here).</summary>
    public void ShowPatient(Patient patient)
    {
        RangeBox.SelectedIndex = 2;
        _stage = "all";
        SearchBox.Text = patient.PatientCode;
        Refresh();
    }

    private void UpdateChips()
    {
        int N(VisitStage s) => _all.Count(v => v.Stage == s);
        AllChip.Content = $"All  {_all.Count}";
        WaitingChip.Content = $"Waiting  {N(VisitStage.Waiting)}";
        TestingChip.Content = $"Testing  {N(VisitStage.Testing)}";
        ReadyChip.Content = $"Ready  {N(VisitStage.Ready)}";
        DoneChip.Content = $"Done  {N(VisitStage.Done)}";
        foreach (var (b, key) in new[] { (AllChip, "all"), (WaitingChip, "waiting"), (TestingChip, "testing"), (ReadyChip, "ready"), (DoneChip, "done") }) b.Classes.Set("on", key == _stage);
    }

    private void OnChip(object? sender, RoutedEventArgs e)
    {
        _stage = (string)((Button)sender!).Tag!;
        UpdateChips();
        ApplyFilter();
    }

    private void OnRefresh(object? sender, RoutedEventArgs e) => Refresh();

    private void ApplyFilter()
    {
        var words = (SearchBox.Text ?? "").Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var rows = _all.Where(v => (_stage == "all" || v.StageText.ToLowerInvariant() == _stage)
            && words.All(w => v.PatientName.Contains(w, StringComparison.OrdinalIgnoreCase) || v.PatientCode.Contains(w, StringComparison.OrdinalIgnoreCase)
                              || v.Phone.Contains(w) || v.Tests.Any(t => t.TestName.Contains(w, StringComparison.OrdinalIgnoreCase)))).ToList();
        Grid.ItemsSource = rows;
        EmptyText.Text = _all.Count == 0 ? "No patients in this period. Register a visit to start." : rows.Count == 0 ? "Nobody matches. Try another stage or search." : "Pick a patient to see what to do next.";
        ShowSelected();
    }

    private FlowVisit? Current => Grid.SelectedItem as FlowVisit;

    private void ShowSelected()
    {
        var v = Current;
        EmptyPanel.IsVisible = v is null;
        DetailPanel.IsVisible = v is not null;
        if (v is null) return;

        PatientHeading.Text = v.PatientName;
        PatientSub.Text = $"{v.PatientCode}  ·  {v.Phone}  ·  {Dates.FromIso(v.Date)}";
        StageLabel.Text = v.StageText;
        StagePill.Background = (Avalonia.Media.IBrush?)Pills.Background.Convert(v.StageText, typeof(Avalonia.Media.IBrush), null, System.Globalization.CultureInfo.InvariantCulture);
        StageLabel.Foreground = (Avalonia.Media.IBrush?)Pills.Foreground.Convert(v.StageText, typeof(Avalonia.Media.IBrush), null, System.Globalization.CultureInfo.InvariantCulture);
        NextStepText.Text = "Next: " + v.NextStep;
        BillLine.Text = v.Billed <= 0 ? "No bill on this PC for this visit." : v.Due <= 0 ? $"Bill ₹{v.Billed:0.##}, paid in full." : $"Bill ₹{v.Billed:0.##}, paid ₹{v.Paid:0.##}, ₹{v.Due:0.##} still to pay.";
        TestList.ItemsSource = v.Tests.Select(t => $"{t.TestName}   —   {Label(t)}").ToList();
        MessageText.Text = "";

        PrimaryButton.IsVisible = v.Stage is VisitStage.Waiting or VisitStage.Testing;
        PrimaryButton.Content = v.Stage == VisitStage.Waiting ? "Start testing" : "Enter results";
        PayButton.IsVisible = v.Due > 0;
        ReportButton.IsVisible = v.Finished > 0;
        MoreButton.IsVisible = true;
    }

    private static string Label(PatientTest t) =>
        t.Status == "completed" ? "done" : !string.IsNullOrEmpty(t.ExternalLabId) ? "at an external lab" : t.Status == "in_progress" ? "being tested" : "waiting";

    private Patient? CurrentPatient => Current is { } v ? _session.Store.GetPatient(v.PatientId) : null;

    private void OnPrimary(object? sender, RoutedEventArgs e)
    {
        if (Current is not { } v) return;
        if (v.Stage == VisitStage.Waiting)
        {
            var started = _results.StartTesting(v.Tests.Where(t => t.Status == "pending").Select(t => t.Id));
            Refresh();
            MessageText.Text = started == 0 ? "Nothing to start." : $"Testing started for {started} test(s).";
            Changed?.Invoke();
        }
        else if (CurrentPatient is { } patient) EnterResultsRequested?.Invoke(patient);
    }

    private void OnPay(object? sender, RoutedEventArgs e) { if (CurrentPatient is { } p) TakePaymentRequested?.Invoke(p); }
    private void OnMoreTests(object? sender, RoutedEventArgs e) { if (CurrentPatient is { } p) RegisterMoreRequested?.Invoke(p); }

    private async void OnReport(object? sender, RoutedEventArgs e)
    {
        if (Current is not { } v) return;
        MessageText.Text = await ReportPrint.RunAsync((Window)TopLevel.GetTopLevel(this)!, _session, v.PatientId, v.Date);
    }
}
