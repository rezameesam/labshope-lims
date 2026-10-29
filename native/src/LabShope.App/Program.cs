using Avalonia;
using System;
using Velopack;

namespace LabShope.App;

class Program
{
    // Initialization code. Don't use any Avalonia, third-party APIs or any
    // SynchronizationContext-reliant code before AppMain is called: things aren't initialized
    // yet and stuff might break.
    /// <summary>True when another copy is already open (this one only shows a short message and closes).</summary>
    public static bool AlreadyRunning { get; private set; }

    [STAThread]
    public static void Main(string[] args)
    {
        LabShope.Core.AppCulture.Apply(); // numbers and dates behave the same on every computer

        // Must run first: handles the installer's own start-up calls (install, update, uninstall) and exits.
        VelopackApp.Build().Run();

        // One copy per user: a second one would fight the first over the local database.
        using var instance = LabShope.Core.InstanceLock.TryAcquire(System.IO.Path.Combine(AppConfig.DataDirectory, "instance.lock"));
        AlreadyRunning = instance is null;
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    // Avalonia configuration, don't remove; also used by visual designer.
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
#if DEBUG
            .WithDeveloperTools()
#endif
            .WithInterFont()
            .LogToTrace();
}
