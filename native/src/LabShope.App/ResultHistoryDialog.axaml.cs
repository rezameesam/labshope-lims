using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Who changed a test's result or status, and when.</summary>
public partial class ResultHistoryDialog : Window
{
    private readonly AppSession _session;
    private readonly PatientTest _test;

    public ResultHistoryDialog() => throw new InvalidOperationException("Use the constructor with a session.");

    public ResultHistoryDialog(AppSession session, PatientTest test)
    {
        _session = session;
        _test = test;
        InitializeComponent();
        Heading.Text = $"{test.TestName}: history";
        Opened += async (_, _) => await LoadAsync();
    }

    public async Task LoadAsync()
    {
        if (_session.Api is null) { StatusText.Text = "The history needs an internet connection."; return; }
        StatusText.Text = "Loading…";
        var (entries, error) = await ResultHistory.LoadAsync(_session.Api, _session.Workspace.OrganizationId, _test.Id);
        Grid.ItemsSource = entries;
        StatusText.Text = error ?? (entries.Count == 0 ? "Nothing has been recorded for this test yet." : $"{entries.Count} change(s), newest first.");
    }

    private void OnClose(object? sender, RoutedEventArgs e) => Close();
}
