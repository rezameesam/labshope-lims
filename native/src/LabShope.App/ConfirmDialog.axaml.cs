using Avalonia.Controls;
using Avalonia.Interactivity;

namespace LabShope.App;

/// <summary>A plain yes/no question for actions that can't be undone.</summary>
public partial class ConfirmDialog : Window
{
    public bool Confirmed { get; private set; }

    public ConfirmDialog() : this("", "", "OK") { }

    public ConfirmDialog(string heading, string detail, string okText)
    {
        InitializeComponent();
        Heading.Text = heading;
        Detail.Text = detail;
        OkButton.Content = okText;
    }

    private void OnOk(object? sender, RoutedEventArgs e) { Confirmed = true; Close(); }
    private void OnCancel(object? sender, RoutedEventArgs e) => Close();

    public static async Task<bool> AskAsync(Window owner, string heading, string detail, string okText)
    {
        var dialog = new ConfirmDialog(heading, detail, okText);
        await dialog.ShowDialog(owner);
        return dialog.Confirmed;
    }
}
