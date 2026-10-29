using System.Net;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.App.Tests;

/// <summary>The "New test" and "Add staff" windows: what they send to the server and what they say when it refuses.</summary>
public class SetupDialogTests
{
    private sealed class Server(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public List<(string Url, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            Calls.Add((r.RequestUri!.ToString(), r.Content is null ? "" : await r.Content.ReadAsStringAsync(ct)));
            return new HttpResponseMessage(status) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };
        }
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static async Task Click(Window window, string button)
    {
        window.FindControl<Button>(button)!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        for (var i = 0; i < 100 && !window.FindControl<Button>(button)!.IsEnabled; i++) await Task.Delay(20); // waits while the request is in flight
    }

    [AvaloniaFact]
    public async Task ANewTestIsSentWithItsCodeAndTheWindowCloses()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var catalog = new Catalog([new CatalogTest("t1", "CBC001", "Complete Blood Count", 350m, null)], [], [], [], [], [new TestCategory("c1", "Haematology")]);
        var dialog = new NewTestDialog(Api(server), "org-1", catalog);
        dialog.Show();

        dialog.FindControl<TextBox>("NameBox")!.Text = "Complete Blood Count (Paediatric)";
        dialog.FindControl<TextBox>("PriceBox")!.Text = "300";
        await Click(dialog, "SaveButton");

        Assert.True(dialog.Saved);
        var call = Assert.Single(server.Calls);
        Assert.Contains("/rest/v1/tests", call.Url);
        Assert.Contains("\"test_id\":\"CBC002\"", call.Body);
        Assert.Contains("\"organization_id\":\"org-1\"", call.Body);
    }

    [AvaloniaFact]
    public async Task ANewTestWithoutANameShowsTheProblemAndSendsNothing()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var dialog = new NewTestDialog(Api(server), "org-1", new Catalog([], [], [], [], []));
        dialog.Show();

        await Click(dialog, "SaveButton");

        Assert.False(dialog.Saved);
        Assert.True(dialog.FindControl<Border>("ErrorBox")!.IsVisible);
        Assert.Contains("test name", dialog.FindControl<TextBlock>("ErrorText")!.Text);
        Assert.Empty(server.Calls);
    }

    [AvaloniaFact]
    public async Task AddingStaffSendsTheAccountAndAServerRefusalIsShown()
    {
        var labs = new[] { new LabRef("lab-1", "Main Lab", "ML") };

        var ok = new Server(HttpStatusCode.OK, """{"user_id":"u1","employee_row_id":"e1"}""");
        var dialog = new StaffDialog(Api(ok), "org-1", labs, "lab-1");
        dialog.Show();
        dialog.FindControl<TextBox>("NameBox")!.Text = "Asha Rao";
        dialog.FindControl<TextBox>("EmailBox")!.Text = "asha@lab.com";
        dialog.FindControl<TextBox>("PasswordBox")!.Text = "longenough1";
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        Assert.Contains("/functions/v1/create-employee", Assert.Single(ok.Calls).Url);
        Assert.Contains("\"lab_id\":\"lab-1\"", ok.Calls[0].Body);

        var refused = new Server(HttpStatusCode.Forbidden, """{"error":"Only admins can create employees"}""");
        var second = new StaffDialog(Api(refused), "org-1", labs, "lab-1");
        second.Show();
        second.FindControl<TextBox>("NameBox")!.Text = "Asha Rao";
        second.FindControl<TextBox>("EmailBox")!.Text = "asha@lab.com";
        second.FindControl<TextBox>("PasswordBox")!.Text = "longenough1";
        await Click(second, "SaveButton");
        Assert.False(second.Saved);
        Assert.Contains("Only an admin", second.FindControl<TextBlock>("ErrorText")!.Text);
    }
}
