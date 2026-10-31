using System.Net;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class ReportDetailsTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    public ReportDetailsTests() => _store = new LocalStore(_path);

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static ReportTemplate Template(bool notes) => new("tpl", "Default", Org, null, null, null, null, "table", true, true, notes, true);

    private void Setup(bool notes)
    {
        _store.ReplaceCatalog(new Catalog([new CatalogTest("t-hb", "HB", "Haemoglobin", 200m, null)], [], [], [new LabRef("l1", "Main Lab", "ML")],
            [new CenterRef("cc1", "Sunrise Collection Point", "SCP", "l1")], [], [Template(notes)]));
        _store.UpsertPatient(new Patient("p1", "IRM-1", "Asha Rao", "+919876543210", "female", null));
        new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-29", [new VisitTest("Haemoglobin", 200)], ExistingPatient: _store.GetPatient("p1")));
    }

    [Fact]
    public void ThePrintedReportShowsBloodGroupRegistryNumberCentreNotesAndWhoEnteredIt()
    {
        Setup(notes: true);
        var test = _store.SearchWorklist("", ["pending"])[0];
        new ResultService(_store, Org, "staff-1").Enter(test.Id, "11");
        _store.SetPatientExtra("p1", "O+", "cc1");
        _store.SetTestExtra(test.Id, "REG-42", "Fasting sample", "staff-1");
        _store.SetMeta("staff_names", """{"staff-1":"Dr. Meera"}""");

        var html = ReportHtml.Build(ReportBuilder.For(_store, "Sunrise", "p1", "2026-10-29", organizationId: Org, labId: "l1")!);

        Assert.Contains("<b>Blood Group:</b>O+", html);
        Assert.Contains("<b>Registry No:</b>REG-42", html);
        Assert.Contains("<b>Center:</b>SCP", html);
        Assert.Contains("<th>Notes</th>", html);
        Assert.Contains("Fasting sample", html);
        Assert.Contains("Results Entered By:</b> Dr. Meera", html);
    }

    [Fact]
    public void WithoutThoseDetailsTheReportSaysNotAvailableAndAResultEnteredHereRemembersWho()
    {
        Setup(notes: false);
        var test = _store.SearchWorklist("", ["pending"])[0];
        new ResultService(_store, Org, "staff-9").Enter(test.Id, "11");
        _store.SetTestExtra(test.Id, null, "hidden note", "staff-9");

        var html = ReportHtml.Build(ReportBuilder.For(_store, "Sunrise", "p1", "2026-10-29", organizationId: Org, labId: "l1")!);

        Assert.Contains("<b>Blood Group:</b>N/A", html);
        Assert.DoesNotContain("Registry No", html);
        Assert.DoesNotContain("<b>Center:</b>", html);
        Assert.DoesNotContain("Notes", html);                                  // the template leaves notes off
        Assert.Equal("staff-9", _store.GetTestExtra(test.Id).EnteredBy);
        Assert.DoesNotContain("Results Entered By", html);                       // the name isn't known on this PC yet
    }

    [Fact]
    public async Task PullingPatientsAndTestsKeepsTheNewDetailsAndStaffNames()
    {
        var server = new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath switch
        {
            var p when p.EndsWith("/patients") => (HttpStatusCode.OK, """[{"id":"p1","patient_id":"IRM-1","full_name":"Asha Rao","phone":"9999999999","gender":null,"date_of_birth":null,"is_active":true,"blood_group":"B+","collection_center_id":"cc1","updated_at":"2026-10-29T10:00:00Z"}]"""),
            var p when p.EndsWith("/patient_tests") => (HttpStatusCode.OK, """[{"id":"t1","patient_id":"p1","test_name":"HB","test_date":"2026-10-29","status":"completed","registry_serial":"R-7","notes":"ok","result_entered_by":"staff-1","updated_at":"2026-10-29T10:00:00Z"}]"""),
            var p when p.EndsWith("/employees") => (HttpStatusCode.OK, """[{"user_id":"staff-1","full_name":"Dr. Meera"}]"""),
            _ => (HttpStatusCode.OK, "[]"),
        } };
        var engine = new SyncEngine(_store, Api(server), Org);

        await engine.PullPatientsAsync();
        await engine.PullPatientTestsAsync();
        await engine.PullStaffNamesAsync();

        Assert.Equal(("B+", "cc1"), _store.GetPatientExtra("p1"));
        Assert.Equal(("R-7", "ok", "staff-1"), _store.GetTestExtra("t1"));
        Assert.Equal("Dr. Meera", _store.GetStaffNames()["staff-1"]);
        Assert.Contains(server.Requests, q => q.Url.Contains("blood_group"));
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
