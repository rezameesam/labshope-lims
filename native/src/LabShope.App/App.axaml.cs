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
            _ = StartAsync(desktop);
        }
        base.OnFrameworkInitializationCompleted();
    }

    private static async System.Threading.Tasks.Task StartAsync(IClassicDesktopStyleApplicationLifetime desktop)
    {
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

        var store = new LocalStore(Path.Combine(AppConfig.DataDirectory, $"lims-{workspace.OrganizationId}.db"));
        var session = new AppSession(workspace, store, new SyncRunner(new SyncEngine(store, api, workspace.OrganizationId), store, workspace.Slug, workspace.OrganizationName), account);

        var main = new MainWindow(session);
        main.Closed += (_, _) => { session.Dispose(); desktop.Shutdown(); };
        desktop.MainWindow = main;
        main.Show();
    }
}
