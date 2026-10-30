using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public sealed class PatientAdminTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-pa-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    public PatientAdminTests() => _store = new LocalStore(_path);

    public void Dispose() { _store.Dispose(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) try { File.Delete(f); } catch { } }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly DateTimeOffset Now = new(2026, 10, 30, 10, 0, 0, TimeSpan.Zero);

    private static Task<AddPatientResult> Add(SupabaseApi api, LocalStore store, StandalonePatient p) =>
        PatientAdmin.AddAsync(api, store, "org-1", "user-1", p, () => Now, () => "4821");

    [Fact]
    public async Task AddsAPatientWithTheWebsitesIdAndSavesItHere()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };

        var result = await Add(Api(server), _store, new StandalonePatient("  asha   rao ", "98765 43210", "female", "1990-05-12", "a@x.in", "MG Road", "O+"));

        Assert.True(result.Ok, result.Error);
        Assert.Equal("PAT264821", result.Patient!.PatientCode);
        var call = server.Requests.Single();
        Assert.Equal("POST", call.Method.Method);
        Assert.EndsWith("/rest/v1/patients", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("PAT264821", "org-1", "user-1", "O+", "1990-05-12", false),
            (body.GetProperty("patient_id").GetString(), body.GetProperty("organization_id").GetString(), body.GetProperty("created_by").GetString(),
             body.GetProperty("blood_group").GetString(), body.GetProperty("date_of_birth").GetString(), body.GetProperty("password_reset_required").GetBoolean()));
        Assert.Equal(result.Patient.Id, body.GetProperty("id").GetString());
        Assert.Equal(result.Patient, _store.GetPatient(result.Patient.Id)); // searchable straight away
    }

    [Fact]
    public async Task WarnsAboutASharedPhoneUnlessToldToAddAnyway()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        var first = await Add(Api(server), _store, new StandalonePatient("Asha Rao", "9876543210", null, null));
        Assert.True(first.Ok);
        server.Requests.Clear();

        var second = await Add(Api(server), _store, new StandalonePatient("Ravi Rao", "98765 43210", null, null));
        Assert.False(second.Ok);
        Assert.Equal("Asha Rao", second.SamePhone!.Single().FullName);
        Assert.Empty(server.Requests); // nothing sent while the warning is open

        var forced = await Add(Api(server), _store, new StandalonePatient("Ravi Rao", "98765 43210", null, null, AllowDuplicatePhone: true));
        Assert.True(forced.Ok);
        Assert.Single(server.Requests);
    }

    [Theory]
    [InlineData("", "", "name")]
    [InlineData("Asha", "12", "phone")]
    public async Task RefusesBadInputBeforeAskingTheServer(string name, string phone, string expected)
    {
        var server = new FakeServer();
        var result = await Add(Api(server), _store, new StandalonePatient(name, phone, null, null));
        Assert.False(result.Ok);
        Assert.Contains(expected, result.Error, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task ExplainsOfflineAndNotAllowedAndKeepsNothingLocally()
    {
        var offline = await Add(Api(new OfflineServer()), _store, new StandalonePatient("Asha Rao", "", null, null));
        Assert.Contains("internet", offline.Error);

        var denied = await Add(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") }), _store, new StandalonePatient("Asha Rao", "", null, null));
        Assert.Contains("isn't allowed", denied.Error);
        Assert.Equal(0, _store.PatientCount());
    }

    [Fact]
    public async Task SwitchingOffRemovesThePatientHereAndOnBringsThemBack()
    {
        var patient = new Patient("p1", "PAT1", "Asha Rao", "+919876543210", "female", null);
        _store.UpsertPatient(patient);
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"p1"}]""") };

        var off = await PatientAdmin.SetActiveAsync(Api(server), _store, "org-1", patient, active: false);
        Assert.True(off.Ok);
        var call = server.Requests.Single();
        Assert.Equal("PATCH", call.Method.Method);
        Assert.Contains("/rest/v1/patients?id=eq.p1&organization_id=eq.org-1", call.Url);
        Assert.False(JsonDocument.Parse(call.Body).RootElement.GetProperty("is_active").GetBoolean());
        Assert.Null(_store.GetPatient("p1"));

        var on = await PatientAdmin.SetActiveAsync(Api(server), _store, "org-1", patient, active: true);
        Assert.True(on.Ok);
        Assert.NotNull(_store.GetPatient("p1"));
    }

    [Fact]
    public async Task ASwitchOffTheServerRefusesLeavesThePatientHere()
    {
        var patient = new Patient("p1", "PAT1", "Asha Rao", "", null, null);
        _store.UpsertPatient(patient);

        var refused = await PatientAdmin.SetActiveAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") }), _store, "org-1", patient, false);
        Assert.False(refused.Ok);
        var offline = await PatientAdmin.SetActiveAsync(Api(new OfflineServer()), _store, "org-1", patient, false);
        Assert.Contains("internet", offline.Error);
        Assert.NotNull(_store.GetPatient("p1"));
    }

    [Fact]
    public async Task ListsTheSwitchedOffPatientsFromTheServer()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"p9","patient_id":"PAT9","full_name":"Old Patient","phone":"+911","gender":null,"date_of_birth":null}]""") };

        var (patients, error) = await PatientAdmin.LoadInactiveAsync(Api(server), "org-1");

        Assert.Null(error);
        Assert.Equal("Old Patient", patients.Single().FullName);
        Assert.Contains("is_active=eq.false", server.Requests[0].Url);
        Assert.Contains("organization_id=eq.org-1", server.Requests[0].Url);
        var (none, offlineError) = await PatientAdmin.LoadInactiveAsync(Api(new OfflineServer()), "org-1");
        Assert.Empty(none);
        Assert.Contains("internet", offlineError);
    }

    [Fact]
    public void HistoryListsOnlyThatPatientsBillsAndTestsWithTotals()
    {
        _store.UpsertPatient(new Patient("p1", "PAT1", "Asha Rao", "", null, null));
        _store.UpsertPatient(new Patient("p2", "PAT2", "Ravi Rao", "", null, null));
        _store.UpsertInvoice(new Invoice("i1", "INV-1", "p1", 500m, 200m, "partial", "2026-10-01T10:00:00", 0m));
        _store.UpsertInvoice(new Invoice("i2", "INV-2", "p1", 300m, 300m, "paid", "2026-10-20T10:00:00", 50m));
        _store.UpsertInvoice(new Invoice("i3", "INV-3", "p2", 999m, 0m, "pending", "2026-10-21T10:00:00", 0m));
        _store.UpsertPatientTest(new PatientTest("t1", "p1", "CBC", "2026-10-01", "completed", "ok"));
        _store.UpsertPatientTest(new PatientTest("t2", "p2", "LFT", "2026-10-21", "pending"));

        var history = PatientAdmin.HistoryOf(_store, "p1");

        Assert.Equal(["INV-2", "INV-1"], history.Bills.Select(b => b.InvoiceNumber)); // newest first
        Assert.Equal("CBC", history.Tests.Single().TestName);
        Assert.Equal((800m, 300m), (history.Billed, history.Owed));
        Assert.Equal(50m, history.Bills[0].Discount);
    }
}
