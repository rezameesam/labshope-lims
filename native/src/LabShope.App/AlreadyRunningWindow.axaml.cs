using Avalonia.Controls;
using Avalonia.Interactivity;

namespace LabShope.App;

public partial class AlreadyRunningWindow : Window
{
    public AlreadyRunningWindow() => InitializeComponent();
    private void OnOk(object? sender, RoutedEventArgs e) => Close();
}
