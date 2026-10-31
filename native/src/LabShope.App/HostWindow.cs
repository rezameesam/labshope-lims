using Avalonia.Controls;

namespace LabShope.App;

/// <summary>Opens one of the app's screens in its own window on top of the current one, so staff can finish a job (results, payment, more tests) without leaving where they are.</summary>
public static class HostWindow
{
    public static async Task ShowAsync(Window owner, string title, Control content, double width = 1240, double height = 820, Action<Window>? created = null)
    {
        var window = new Window
        {
            Title = title, Width = Math.Min(width, owner.Bounds.Width > 0 ? owner.Bounds.Width : width), Height = Math.Min(height, owner.Bounds.Height > 0 ? owner.Bounds.Height : height),
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Content = new Border { Padding = new Avalonia.Thickness(22), Child = content },
        };
        created?.Invoke(window);
        await window.ShowDialog(owner);
    }
}
