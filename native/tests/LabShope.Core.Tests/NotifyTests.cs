using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Notify;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class NotifyTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly ResultService _results;
    private string _patientId = "";

    public NotifyTests()
    {
        _store = new LocalStore(_path);
        _results = new ResultService(_store, Org, "user-1");
        _store.SaveBranding(Branding.FromContext("""{"organization":{"display_name":"Sunrise Diagnostics","primary_phone":"+911","primary_email":"hi@sunrise.example"},"primary_lab":{"address":"12 Park Road","city":"Pune"},"settings":{}}""", "x")!);
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    // Orders two tests for a patient who has already reached the server.
    private IReadOnlyList<WorklistRow> Order()
    {
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Asha Rao", "+919876543210", null, null));
        _patientId = "p1";
        new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-29", [new VisitTest("CBC", 300), new VisitTest("LFT", 450)], ExistingPatient: _store.GetPatient("p1")));
        return _store.SearchWorklist("", ["pending"]);
    }

    private static (HttpStatusCode, string) Route(HttpRequestMessage req, string? email = "asha@example.com", string settings = "[]")
    {
        var path = req.RequestUri!.AbsolutePath;
        if (path.EndsWith("/patients")) return (HttpStatusCode.OK, "[{\"full_name\":\"Asha Rao\",\"email\":" + (email is null ? "null" : $"\"{email}\"") + "}]");
        if (path.EndsWith("/organization_settings")) return (HttpStatusCode.OK, settings);
        if (path.EndsWith("/system_settings")) return (HttpStatusCode.OK, "[]");
        if (path.EndsWith("/send-email")) return (HttpStatusCode.OK, """{"success":true}""");
        if (req.Method.Method == "PATCH") return (HttpStatusCode.OK, "[{\"id\":\"x\"}]");
        return (HttpStatusCode.OK, """{"patient_uuid":"p1","invoice_number":"INV1"}""");
    }

    private async Task<FakeServer> FinishAllAndSync(Func<HttpRequestMessage, (HttpStatusCode, string)>? route = null)
    {
        var rows = Order();
        _store.SetVisitStatus(_store.NextPendingVisit()!.VisitId, "done");
        foreach (var r in rows) _results.Enter(r.Id, "5");
        var server = new FakeServer { Handler = (req, _) => (route ?? (r => Route(r)))(req) };
        var engine = new SyncEngine(_store, Api(server), Org);
        await engine.FlushOutboxAsync();
        await engine.SendReadyNotificationsAsync("sunrise", "Sunrise");
        return server;
    }

    [Fact]
    public async Task EmailsThePatientOnceEveryTestIsFinishedAndConfirmedWithTheWebsitesWording()
    {
        var server = await FinishAllAndSync();

        var mail = server.Requests.Single(r => r.Url.EndsWith("/functions/v1/send-email"));
        var body = JsonDocument.Parse(mail.Body).RootElement;
        Assert.Equal("asha@example.com", body.GetProperty("to").GetString());
        Assert.Equal("All Test Results Ready (2)", body.GetProperty("subject").GetString());
        var html = body.GetProperty("htmlContent").GetString()!;
        Assert.Contains("Dear Asha Rao", html);
        Assert.Contains("Tests: CBC, LFT.", html);
        Assert.Contains("https://sunrise.labshope.com/auth/patient", html);
        Assert.Contains("Sunrise Diagnostics", html);
        Assert.Contains("12 Park Road", html);
        Assert.Contains("Dear Asha Rao", body.GetProperty("textContent").GetString());
        Assert.Equal("p1", body.GetProperty("patientId").GetString());
        Assert.Empty(_store.PendingReadyNotifications()); // sent once, not queued again
    }

    [Fact]
    public async Task WaitsWhileAnyTestOfTheVisitIsStillOpen()
    {
        var rows = Order();
        _store.SetVisitStatus(_store.NextPendingVisit()!.VisitId, "done");
        _results.Enter(rows[0].Id, "5"); // only one of two
        var server = new FakeServer { Handler = (r, _) => Route(r) };
        var engine = new SyncEngine(_store, Api(server), Org);

        await engine.FlushOutboxAsync();
        await engine.SendReadyNotificationsAsync("sunrise", "Sunrise");
        Assert.DoesNotContain(server.Requests, r => r.Url.EndsWith("/send-email"));
        Assert.Single(_store.PendingReadyNotifications()); // still waiting for the other test

        _results.Enter(rows[1].Id, "6");
        await engine.FlushOutboxAsync();
        await engine.SendReadyNotificationsAsync("sunrise", "Sunrise");
        Assert.Single(server.Requests, r => r.Url.EndsWith("/send-email"));
    }

    [Fact]
    public async Task DoesNotEmailSomeoneWithoutAnAddress()
    {
        var server = await FinishAllAndSync(r => Route(r, email: null));
        Assert.DoesNotContain(server.Requests, r => r.Url.EndsWith("/send-email"));
        Assert.Empty(_store.PendingReadyNotifications());
    }

    [Fact]
    public async Task KeepsTheEmailQueuedWhenOffline()
    {
        var rows = Order();
        _store.SetVisitStatus(_store.NextPendingVisit()!.VisitId, "done");
        foreach (var r in rows) _results.Enter(r.Id, "5");
        await new SyncEngine(_store, Api(new FakeServer { Handler = (r, _) => Route(r) }), Org).FlushOutboxAsync();

        await new SyncEngine(_store, Api(new OfflineServer()), Org).SendReadyNotificationsAsync("sunrise", "Sunrise");

        Assert.Single(_store.PendingReadyNotifications()); // tried again at the next sync
    }

    [Fact]
    public async Task UsesTheLabsOwnWordingWhenItSetsOne()
    {
        const string custom = """[{"setting_key":"notification_all_tests_ready_subject","setting_value":"Reports ready, {patient_name}!"},{"setting_key":"notification_all_tests_ready_message","setting_value":"Hi {patient_name}, collect {test_count} reports at {portal_url}"}]""";
        var server = await FinishAllAndSync(r => Route(r, settings: custom));

        var body = JsonDocument.Parse(server.Requests.Single(r => r.Url.EndsWith("/send-email")).Body).RootElement;
        Assert.Equal("Reports ready, Asha Rao!", body.GetProperty("subject").GetString());
        Assert.Contains("Hi Asha Rao, collect 2 reports at https://sunrise.labshope.com/auth/patient", body.GetProperty("htmlContent").GetString());
    }

    [Fact]
    public void TemplatesRenderMarkersAndEscapeHtmlLikeTheWebsite()
    {
        Assert.Equal("Hi Asha, 3 tests", NotificationTemplates.Render("Hi {name}, {n} tests", new Dictionary<string, string> { ["name"] = "Asha", ["n"] = "3" }));

        var brand = new EmailBrand("Lab <X>", "Tag", "Addr", "+91", "a@b.c", "https://lab.example", null);
        var html = EmailTemplate.Html("Title", "Line 1\nA <b> & B", brand, 2026);
        Assert.Contains("Line 1<br/>A &lt;b&gt; &amp; B", html);
        Assert.Contains("© 2026 Lab <X>. All rights reserved.", html);
        var text = EmailTemplate.Text("Title", "Body", brand);
        Assert.Contains("Visit: https://lab.example", text);
        Assert.DoesNotContain("Visit: https://lab.example\n\nVisit", text);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
