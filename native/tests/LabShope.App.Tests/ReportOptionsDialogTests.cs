using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using LabShope.Core.Visits;

namespace LabShope.App.Tests;

public class ReportOptionsDialogTests
{
    [AvaloniaFact]
    public void TheDialogShowsTheRememberedChoice()
    {
        var dialog = new ReportOptionsDialog(new ReportOptions(false, true, false));
        dialog.Show();
        Assert.Equal((false, true, false), (dialog.FindControl<CheckBox>("HeaderBox")!.IsChecked, dialog.FindControl<CheckBox>("FooterBox")!.IsChecked, dialog.FindControl<CheckBox>("WatermarkBox")!.IsChecked));
        Assert.Null(dialog.Chosen); // nothing chosen until Print is pressed
        dialog.Close();
    }
}
