using Avalonia;
using Avalonia.Headless;
using LabShope.App;

[assembly: AvaloniaTestApplication(typeof(LabShope.App.Tests.TestAppBuilder))]

namespace LabShope.App.Tests;

public class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp() => AppBuilder.Configure<LabShope.App.App>()
        .UseSkia()
        .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = false });
}
