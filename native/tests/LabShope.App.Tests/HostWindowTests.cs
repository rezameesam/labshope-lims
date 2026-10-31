using Avalonia.Controls;
using Avalonia.Headless.XUnit;

namespace LabShope.App.Tests;

public class HostWindowTests
{
    [AvaloniaFact]
    public async Task AScreenOpensOnTopOfTheCurrentOneAndGivesControlBackWhenClosed()
    {
        var owner = new Window { Width = 800, Height = 600 };
        owner.Show();
        Window? host = null;
        var shown = HostWindow.ShowAsync(owner, "Results: Asha", new TextBlock { Text = "hello" }, created: w => host = w);

        Assert.NotNull(host);
        Assert.Equal("Results: Asha", host!.Title);
        Assert.False(shown.IsCompleted);
        host.Close();
        await shown;
        owner.Close();
    }
}
