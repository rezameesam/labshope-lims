using System.Net;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Scanning;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class LabelTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly VisitService _visits;

    public LabelTests()
    {
        _store = new LocalStore(_path);
        _visits = new VisitService(_store, () => new DateTimeOffset(2026, 10, 29, 4, 0, 0, TimeSpan.Zero), () => 4242);
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private RegisteredVisit Visit(string phone = "9876543210") => _visits.Register(new RegisterVisitInput("org-1", "l1", "2026-10-29",
        [new VisitTest("CBC", 300), new VisitTest("LFT", 450)], NewPatient: new NewPatient("Asha <Rao>", phone, "female")));

    [Fact]
    public void ALabelCarriesWhoWhichBillWhichTestsAndABarcodeOfThePatientCode()
    {
        var visit = Visit();
        var data = LabelBuilder.ForVisit(_store, "Demo & Lab", visit.VisitId, copies: 3)!;

        Assert.Equal(("PAT264242", "L-261029-0001", 3), (data.PatientCode, data.BillNumber, data.Copies));
        Assert.Equal(["CBC", "LFT"], data.Tests);

        var html = LabelHtml.Build(data);
        Assert.Equal(3, System.Text.RegularExpressions.Regex.Matches(html, "class=\"l\"").Count);
        Assert.Contains("Asha &lt;Rao&gt;", html);
        Assert.Contains("Demo &amp; Lab", html);
        Assert.Contains("<svg", html);
    }

    [Fact]
    public void ALabelForAnUnknownVisitIsNull() => Assert.Null(LabelBuilder.ForVisit(_store, "Lab", "nope"));

    [Fact]
    public async Task ALabelPrintedBeforeSyncStillScansAfterTheServerIssuesOfficialNumbers()
    {
        var visit = Visit();
        var local = _store.SearchPatients("asha").Single();
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "{\"patient_uuid\":\"" + local.Id + "\",\"patient_code\":\"IRM-0042\",\"invoice_number\":\"INV2600042\"}") };

        await new SyncEngine(_store, Api(server), "org-1").FlushOutboxAsync();

        Assert.IsType<ScanMatch.FoundPatient>(_store.ResolveScan("IRM-0042"));   // the new code
        Assert.IsType<ScanMatch.FoundPatient>(_store.ResolveScan("PAT264242"));  // the code on the label printed earlier
        Assert.IsType<ScanMatch.FoundInvoice>(_store.ResolveScan("INV2600042"));
        Assert.IsType<ScanMatch.FoundInvoice>(_store.ResolveScan("L-261029-0001")); // the provisional bill number on the receipt
        Assert.IsType<ScanMatch.NotFound>(_store.ResolveScan("PAT269999"));
    }

    [Fact]
    public async Task ALabelForAPatientTheServerMergedIntoAnExistingOneStillScans()
    {
        Visit();
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """{"patient_uuid":"server-9","patient_code":"IRM-0001","invoice_number":"INV1"}""") };
        _store.UpsertPatient(new Patient("server-9", "IRM-0001", "Asha Rao", "+919876543210", null, null)); // the server's real record

        await new SyncEngine(_store, Api(server), "org-1").FlushOutboxAsync();

        var match = Assert.IsType<ScanMatch.FoundPatient>(_store.ResolveScan("PAT264242"));
        Assert.Equal("server-9", match.Patient.Id);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
