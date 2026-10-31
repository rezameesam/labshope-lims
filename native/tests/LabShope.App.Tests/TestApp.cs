using Avalonia;
using Avalonia.Headless;
using LabShope.App;

[assembly: AvaloniaTestApplication(typeof(LabShope.App.Tests.TestAppBuilder))]

namespace LabShope.App.Tests;

public class TestAppBuilder
{
    /// <summary>Runs when the test assembly loads, before any test: screens that save files must never touch the real data folder.</summary>
    [System.Runtime.CompilerServices.ModuleInitializer]
    internal static void UseThrowAwayDataFolder() =>
        Environment.SetEnvironmentVariable(LabShope.Core.DataFolder.OverrideVariable, Path.Combine(Path.GetTempPath(), $"labshope-tests-{Guid.NewGuid():N}"));


    public static AppBuilder BuildAvaloniaApp() => AppBuilder.Configure<LabShope.App.App>()
        .UseSkia()
        .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = false });
}
