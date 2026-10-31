using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Asks what to print on a report (header, footer, watermark) and remembers the answer.</summary>
public partial class ReportOptionsDialog : Window
{
    /// <summary>The chosen options, or null if cancelled.</summary>
    public ReportOptions? Chosen { get; private set; }

    public ReportOptionsDialog() : this(new ReportOptions()) { }

    public ReportOptionsDialog(ReportOptions current)
    {
        InitializeComponent();
        HeaderBox.IsChecked = current.IncludeHeader;
        FooterBox.IsChecked = current.IncludeFooter;
        WatermarkBox.IsChecked = current.IncludeWatermark;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();

    private void OnPrint(object? sender, RoutedEventArgs e)
    {
        Chosen = new ReportOptions(HeaderBox.IsChecked == true, FooterBox.IsChecked == true, WatermarkBox.IsChecked == true);
        Close();
    }
}
