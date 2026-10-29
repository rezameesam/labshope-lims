using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class OutsourceDialog : Window
{
    private readonly ResultService _results;
    private readonly string _testId;

    public bool Sent { get; private set; }

    public OutsourceDialog() => throw new InvalidOperationException("Use the constructor with a test.");

    public OutsourceDialog(ResultService results, string testId, string heading, IReadOnlyList<ExternalLab> labs)
    {
        _results = results;
        _testId = testId;
        InitializeComponent();
        Heading.Text = heading;
        LabBox.ItemsSource = labs;
        LabBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(ExternalLab.Name));
        LabBox.SelectedIndex = labs.Count > 0 ? 0 : -1;
        Opened += (_, _) => CostBox.Focus();
    }

    private void OnSend(object? sender, RoutedEventArgs e)
    {
        try
        {
            _results.Outsource(_testId, (LabBox.SelectedItem as ExternalLab)?.Id ?? "", CostBox.Text ?? "");
            Sent = true;
            Close();
        }
        catch (ArgumentException ex) { ErrorText.Text = ex.Message; ErrorBox.IsVisible = true; }
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
