using System;
using System.IO;
using System.Net.Http;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;

namespace LabShope.App;

public partial class App : Application
{
    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.ShutdownMode = Avalonia.Controls.ShutdownMode.OnExplicitShutdown;
            if (Program.AlreadyRunning)
            {
                var notice = new AlreadyRunningWindow();
                notice.Closed += (_, _) => desktop.Shutdown();
                notice.Show();
            }
            else _ = StartAsync(desktop);
        }
        base.OnFrameworkInitializationCompleted();
    }

    /// <summary>
    /// Unexpected errors are written to the log and the app carries on: a mistake in one screen should never close
    /// the whole program while someone is in the middle of registering a patient.
    /// </summary>
    private static void InstallSafetyNet()
    {
        LabShope.Core.AppLog.Start(Path.Combine(AppConfig.DataDirectory, "logs"));
        LabShope.Core.AppLog.Info($"LabShope LIMS started ({Environment.OSVersion})");

        Avalonia.Threading.Dispatcher.UIThread.UnhandledException += (_, e) =>
        {
            LabShope.Core.AppLog.Error("Unexpected error in the window", e.Exception);
            e.Handled = true;
            ErrorNotice.Raise();
        };
        System.Threading.Tasks.TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            LabShope.Core.AppLog.Error("Unexpected error in a background task", e.Exception);
            e.SetObserved();
        };
        AppDomain.CurrentDomain.UnhandledException += (_, e) => LabShope.Core.AppLog.Error("Fatal error", e.ExceptionObject as Exception);
    }

    private static async System.Threading.Tasks.Task StartAsync(IClassicDesktopStyleApplicationLifetime desktop)
    {
        InstallSafetyNet();
        var api = new SupabaseApi(new HttpClient { Timeout = TimeSpan.FromSeconds(30) }, AppConfig.SupabaseUrl, AppConfig.SupabaseKey);
        var account = new AccountService(api, Path.Combine(AppConfig.DataDirectory, "account.json"));

        // Signed in before? Open straight away (works offline). Otherwise ask.
        var (workspace, _) = await account.RestoreAsync();
        while (workspace is null)
        {
            var login = new LoginWindow(account, account.SavedEmail);
            var closed = new System.Threading.Tasks.TaskCompletionSource();
            login.Closed += (_, _) => closed.TrySetResult();
            login.Show();
            await closed.Task;
            if (login.Result is null) { desktop.Shutdown(); return; }
            workspace = login.Result;
        }

        // Open the lab's data safely: checked on every start, backed up daily, and recovered automatically if damaged.
        var opened = DatabaseGuard.Open(Path.Combine(AppConfig.DataDirectory, $"lims-{workspace.OrganizationId}.db"), Path.Combine(AppConfig.DataDirectory, "backups", workspace.OrganizationId)); // one folder per lab: another lab's backup must never be restored here
        var store = opened.Store;
        var engine = new SyncEngine(store, api, workspace.OrganizationId);
        var session = new AppSession(workspace, store, new SyncRunner(engine, store, workspace.Slug, workspace.OrganizationName, api, workspace.OrganizationId), account, api, engine) { StartupNotice = opened.Notice };

        var main = new MainWindow(session);
        main.Closed += (_, _) => { session.Dispose(); desktop.Shutdown(); };
        desktop.MainWindow = main;
        main.Show();
    }
}
