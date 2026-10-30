using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public sealed class PatientEmailTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-em-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    public PatientEmailTests() => _store = new LocalStore(_path);

    public void Dispose() { _store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) try { File.Delete(f); } catch { } }

    [Theory]
    [InlineData("  Asha@Example.COM ", "asha@example.com")]
    [InlineData("", null)]
    [InlineData(null, null)]
    [InlineData("   ", null)]
    public void CleansAnEmailOrMeansNone(string? typed, string? expected) => Assert.Equal(expected, PatientEmail.Clean(typed));

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("a@b")]
    [InlineData("@example.com")]
    [InlineData("a b@example.com")]
    [InlineData("a@@example.com")]
    [InlineData("a@example.")]
    public void RefusesSomethingThatIsNotAnAddress(string typed) => Assert.Throws<ArgumentException>(() => PatientEmail.Clean(typed));

    private static string Payload(LocalStore store) => store.NextPendingVisit()!.PayloadJson;

    [Fact]
    public void ANewPatientsEmailIsKeptHereAndTravelsWithTheVisit()
    {
        var input = new RegisterVisitInput("org-1", "l1", "2026-10-30", [new VisitTest("CBC", 350m)], NewPatient: new NewPatient("Asha Rao", "9876543210", Email: " Asha@Example.com "));
        new VisitService(_store).Register(input);

        var patient = _store.SearchPatients("asha").Single();
        Assert.Equal("asha@example.com", patient.Email);
        var node = JsonDocument.Parse(Payload(_store)).RootElement.GetProperty("patient").GetProperty("new");
        Assert.Equal("asha@example.com", node.GetProperty("email").GetString());
    }

    [Fact]
    public void WithoutAnEmailNothingIsSentAndABadOneStopsTheVisitBeforeItIsSaved()
    {
        new VisitService(_store).Register(new RegisterVisitInput("org-1", "l1", "2026-10-30", [new VisitTest("CBC", 350m)], NewPatient: new NewPatient("Ravi Kumar", "9811111111")));
        Assert.False(JsonDocument.Parse(Payload(_store)).RootElement.GetProperty("patient").GetProperty("new").TryGetProperty("email", out _));

        var bad = new RegisterVisitInput("org-1", "l1", "2026-10-30", [new VisitTest("CBC", 350m)], NewPatient: new NewPatient("Meera Nair", "9822222222", Email: "oops"));
        Assert.Throws<ArgumentException>(() => new VisitService(_store).Register(bad));
        Assert.Empty(_store.SearchPatients("meera"));
    }

    [Fact]
    public void EditingOnlySendsTheEmailWhenItWasChangedHere()
    {
        _store.UpsertPatient(new Patient("p1", "IRM-1", "Asha Rao", "+919876543210", null, null)); // this PC doesn't know p1's email
        var service = new PatientService(_store, "org-1");

        service.Edit("p1", new PatientEdit("Asha R. Rao", "9876543210", null, null, Email: "")); // name changed, email box left blank
        Assert.False(JsonDocument.Parse(Payload(_store)).RootElement.GetProperty("patch").TryGetProperty("email", out _)); // so the server's email is not wiped

        var done = service.Edit("p1", new PatientEdit("Asha R. Rao", "9876543210", null, null, Email: "New@Example.com"));
        Assert.Equal("new@example.com", done.Email);
        Assert.Equal("new@example.com", _store.GetPatient("p1")!.Email);
        Assert.Throws<ArgumentException>(() => service.Edit("p1", new PatientEdit("Asha R. Rao", "9876543210", null, null, Email: "nope")));
    }

    [Fact]
    public void AnUnsentNewPatientsEditedEmailFollowsItsWaitingVisit()
    {
        new VisitService(_store).Register(new RegisterVisitInput("org-1", "l1", "2026-10-30", [new VisitTest("CBC", 350m)], NewPatient: new NewPatient("Asha Rao", "9876543210", Email: "old@example.com")));
        var patient = _store.SearchPatients("asha").Single();

        new PatientService(_store, "org-1").Edit(patient.Id, new PatientEdit("Asha Rao", "9876543210", null, null, Email: "fixed@example.com"));

        Assert.Equal("fixed@example.com", JsonDocument.Parse(Payload(_store)).RootElement.GetProperty("patient").GetProperty("new").GetProperty("email").GetString());
    }

    [Fact]
    public void AnOlderDatabaseWithoutTheEmailColumnIsUpgraded()
    {
        var path = Path.Combine(Path.GetTempPath(), $"labshope-old-{Guid.NewGuid():N}.db");
        try
        {
            using (var old = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={path}"))
            {
                old.Open();
                using var cmd = old.CreateCommand();
                cmd.CommandText = "CREATE TABLE patients (id TEXT PRIMARY KEY, patient_code TEXT NOT NULL, full_name TEXT NOT NULL, phone TEXT NOT NULL, gender TEXT, date_of_birth TEXT, pending INTEGER NOT NULL DEFAULT 0, search TEXT NOT NULL); " +
                                  "INSERT INTO patients VALUES ('p9','PAT1','Old Patient','+911','female',NULL,0,'old patient');";
                cmd.ExecuteNonQuery();
            }
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();

            using var store = new LocalStore(path);
            Assert.Null(store.GetPatient("p9")!.Email);
            store.UpsertPatient(store.GetPatient("p9")! with { Email = "old@example.com" });
            Assert.Equal("old@example.com", store.GetPatient("p9")!.Email);
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var f in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(path) + "*")) try { File.Delete(f); } catch { } }
    }
}
