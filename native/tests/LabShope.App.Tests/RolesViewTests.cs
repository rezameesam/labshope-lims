using System.Net;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.App.Tests;

public class RolesViewTests : IDisposable
{
    private sealed class Server : HttpMessageHandler
    {
        public List<(string Method, string Path, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content is null ? "" : await r.Content.ReadAsStringAsync(ct);
            Calls.Add((r.Method.Method, r.RequestUri!.AbsolutePath, body));
            var path = r.RequestUri.AbsolutePath;
            var json = r.Method != HttpMethod.Get ? (r.Method.Method is "PATCH" or "DELETE" ? """[{"id":"r1"}]""" : "")
                : path.EndsWith("/custom_roles") ? """[{"id":"r1","name":"Collector","description":"Front desk","is_active":true,"is_system_role":false}]"""
                : path.EndsWith("/role_permissions") && r.RequestUri.Query.Contains("select=permission") ? """[{"permission":"view_patients"}]"""
                : """[{"role_id":"r1"}]""";
            return new HttpResponseMessage(r.Method == HttpMethod.Post ? HttpStatusCode.Created : HttpStatusCode.OK) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
        }
    }

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-roles-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly Server _server = new();
    private readonly AppSession _session;
    private readonly List<Window> _windows = [];

    public RolesViewTests()
    {
        _store = new LocalStore(_path);
        var api = new SupabaseApi(new HttpClient(_server), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u-1", null) };
        _session = new AppSession(new Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), _store,
            new SyncRunner(new SyncEngine(_store, api, "org-1"), _store), new AccountService(api, _path + ".json"), api);
    }

    [AvaloniaFact]
    public async Task TheListShowsRolesAndTheDialogLoadsAndSavesPermissions()
    {
        var view = new RolesView(_session);
        var window = new Window { Content = view };
        window.Show(); _windows.Add(window);
        await view.RefreshAsync();
        var role = Assert.Single(view.FindControl<DataGrid>("Grid")!.ItemsSource!.Cast<RoleRow>());
        Assert.Equal(("Collector", 1, 1), (role.Name, role.Permissions, role.Users));

        var dialog = new RoleDialog(_session, role);
        dialog.Show(); _windows.Add(dialog);
        await dialog.LoadPermissionsAsync();
        Assert.Equal(["view_patients"], dialog.Selected);

        await dialog.SaveAsync();
        Assert.True(dialog.Saved);
        Assert.Contains(_server.Calls, c => c.Method == "PATCH" && c.Path.EndsWith("/custom_roles"));
        Assert.DoesNotContain(_server.Calls, c => c.Method == "POST"); // nothing to add, nothing to remove
    }

    [AvaloniaFact]
    public async Task ANewRoleNeedsANameAndSendsNothingWithout()
    {
        var dialog = new RoleDialog(_session);
        dialog.Show(); _windows.Add(dialog);
        await dialog.SaveAsync();
        Assert.False(dialog.Saved);
        Assert.Equal("Give the role a name.", dialog.FindControl<TextBlock>("ErrorText")!.Text);
        Assert.Empty(_server.Calls);
    }

    [AvaloniaFact]
    public async Task ScanningAnUnknownBarcodeOnInventorySaysSoAndOpensNothing()
    {
        var view = new InventoryView(_session);
        var window = new Window { Content = view };
        window.Show(); _windows.Add(window);

        Assert.False(await view.ScanAsync("0000"));
        Assert.Contains("No item has the barcode", view.FindControl<TextBlock>("DoneText")!.Text);
    }

    public void Dispose()
    {
        foreach (var w in _windows) w.Close();
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_path); } catch { }
    }
}
