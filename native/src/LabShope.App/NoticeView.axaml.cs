using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>The notice board: what needs doing right now, most urgent first. Built from the tests and bills on this PC, so it works offline.</summary>
public partial class NoticeView : UserControl
{
    private readonly AppSession _session;

    public event Action<Patient>? OpenTestRequested;
    public event Action<Patient>? OpenBillRequested;

    public NoticeView() => throw new InvalidOperationException("Use the constructor with a session.");

    public NoticeView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        Grid.SelectionChanged += (_, _) => UpdateOpen();
        Grid.DoubleTapped += (_, _) => OnOpen(null, null!);
        Refresh();
    }

    public void Refresh()
    {
        var (notices, stats) = NoticeBoard.Build(_session.Store, DateOnly.FromDateTime(DateTime.Today));
        PendingTests.Text = stats.PendingTests.ToString();
        LateTests.Text = stats.OverdueTests.ToString();
        PendingBills.Text = stats.PendingBills.ToString();
        LateBills.Text = stats.OverdueBills.ToString();
        SummaryText.Text = stats.Total == 0 ? "" : $"{stats.Total} thing(s) need attention.";
        Grid.ItemsSource = notices;
        Grid.IsVisible = notices.Count > 0;
        EmptyPanel.IsVisible = notices.Count == 0;
        UpdateOpen();
    }

    private void UpdateOpen()
    {
        var n = Grid.SelectedItem as Notice;
        OpenButton.IsEnabled = n is not null;
        OpenText.Text = n?.Action ?? "Open";
    }

    private void OnRefresh(object? sender, RoutedEventArgs e) => Refresh();

    private void OnOpen(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not Notice n || _session.Store.GetPatient(n.PatientId) is not { } patient) return;
        if (n.Kind == "test") OpenTestRequested?.Invoke(patient); else OpenBillRequested?.Invoke(patient);
    }
}
