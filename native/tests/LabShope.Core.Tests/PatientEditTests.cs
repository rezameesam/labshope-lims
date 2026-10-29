using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class PatientEditTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly PatientService _patients;

    public PatientEditTests()
    {
        _store = new LocalStore(_path);
        _patients = new PatientService(_store, Org);
        _store.UpsertPatient(new Patient("p1", "IRM-0001", "Asha Rao", "+919876543210", "female", "1990-05-01"));
        _store.UpsertPatient(new Patient("p2", "IRM-0002", "Ravi Kumar", "+918888888888", "male", null));
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    [Fact]
    public void ChangesTheDetailsAtOnceAndQueuesTheChange()
    {
        var done = _patients.Edit("p1", new PatientEdit("Asha R. Rao", "98765 43211", "female", "1990-05-02"));

        Assert.Equal(("Asha R. Rao", "+919876543211", "1990-05-02"), (done.FullName, done.Phone, done.DateOfBirth));
        Assert.Equal("Asha R. Rao", _store.GetPatient("p1")!.FullName);
        Assert.Equal((1, 0), _store.OutboxCounts());
        Assert.True(_store.HasWaitingPatientEdit("p1"));
        Assert.False(_store.HasWaitingPatientEdit("p2"));
    }

    [Fact]
    public void RefusesBadInputAndSomeoneElsesPhone()
    {
        Assert.Throws<ArgumentException>(() => _patients.Edit("p1", new PatientEdit("  ", "9876543210", null, null)));
        Assert.Throws<ArgumentException>(() => _patients.Edit("p1", new PatientEdit("A", "123", null, null)));
        Assert.Throws<ArgumentException>(() => _patients.Edit("p1", new PatientEdit("A", "9876543210", null, "not-a-date")));
        Assert.Throws<ArgumentException>(() => _patients.Edit("nope", new PatientEdit("A", "9876543210", null, null)));
        Assert.Equal((0, 0), _store.OutboxCounts());
    }

    [Fact]
    public void ThePhoneIsOptionalAndANumberMayBeSharedByFamilyMembers()
    {
        var shared = _patients.Edit("p1", new PatientEdit("Asha Rao", "88888 88888", "female", "1990-05-01")); // Ravi's number
        Assert.Equal("+918888888888", shared.Phone);

        var none = _patients.Edit("p1", new PatientEdit("Asha Rao", "  ", "female", "1990-05-01"));
        Assert.Equal("", none.Phone);
        Assert.Equal(2, _store.OutboxCounts().Pending);
    }

    [Fact]
    public void ChangingNothingQueuesNothing()
    {
        _patients.Edit("p1", new PatientEdit("Asha Rao", "9876543210", "female", "1990-05-01"));
        Assert.Equal((0, 0), _store.OutboxCounts());
    }

    [Fact]
    public async Task SendsTheChangeAsAnUpdateOfThatPatientRow()
    {
        _patients.Edit("p1", new PatientEdit("Asha R. Rao", "9876543210", "female", "1990-05-01"));
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[{\"id\":\"p1\"}]") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(new FlushOutcome(1, 0, null), outcome);
        var call = server.Requests.Single();
        Assert.Equal("PATCH", call.Method.Method);
        Assert.Contains("/rest/v1/patients?id=eq.p1&organization_id=eq.org-1", call.Url);
        Assert.Equal("Asha R. Rao", JsonDocument.Parse(call.Body).RootElement.GetProperty("full_name").GetString());
        Assert.False(_store.HasWaitingPatientEdit("p1"));
    }

    [Fact]
    public async Task AChangeTheServerRefusesPutsTheOldDetailsBack()
    {
        _patients.Edit("p1", new PatientEdit("Asha R. Rao", "9876543299", "female", "1990-05-01"));
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, """{"code":"23505","message":"duplicate key value violates unique constraint"}""") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(1, outcome.Failed);
        var back = _store.GetPatient("p1")!;
        Assert.Equal(("Asha Rao", "+919876543210"), (back.FullName, back.Phone));
    }

    [Fact]
    public async Task AWaitingEditIsNotOverwrittenByAPullButIsOnceSent()
    {
        _patients.Edit("p1", new PatientEdit("Asha R. Rao", "9876543210", "female", "1990-05-01"));
        const string row = """[{"id":"p1","patient_id":"IRM-0001","full_name":"Asha Rao","phone":"+919876543210","gender":"female","date_of_birth":"1990-05-01","is_active":true,"updated_at":"2026-10-29T07:00:00+00:00"}]""";
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, row) };

        await new SyncEngine(_store, Api(server), Org).PullPatientsAsync();
        Assert.Equal("Asha R. Rao", _store.GetPatient("p1")!.FullName); // ours, still waiting
    }

    [Fact]
    public void EditingAPatientNotYetOnTheServerUpdatesTheWaitingVisitToo()
    {
        var visit = new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-29", [new VisitTest("CBC", 300)],
            NewPatient: new NewPatient("Asha Raoo", "9876500001")));
        var id = _store.SearchPatients("raoo").Single().Id;

        _patients.Edit(id, new PatientEdit("Asha Rao", "9876500002", "female", null));

        var sent = JsonDocument.Parse(_store.GetVisit(visit.VisitId)!.PayloadJson).RootElement.GetProperty("patient").GetProperty("new");
        Assert.Equal(("Asha Rao", "+919876500002"), (sent.GetProperty("full_name").GetString(), sent.GetProperty("phone").GetString()));
        Assert.Contains("+919876500002", sent.GetProperty("phone_variants").EnumerateArray().Select(v => v.GetString()));
        Assert.True(sent.GetProperty("allow_duplicate_phone").GetBoolean()); // a deliberate edit must not be merged away by the server
        Assert.Equal((1, 0), _store.OutboxCounts()); // still just the visit: no separate edit for a row that doesn't exist yet
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
