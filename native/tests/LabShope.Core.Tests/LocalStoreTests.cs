using LabShope.Core.Data;

namespace LabShope.Core.Tests;

public class LocalStoreTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    public LocalStoreTests()
    {
        _store = new LocalStore(_path);
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "9999999999", "female", null));
        _store.UpsertPatient(new Patient("p2", "IRM-0008", "Ravi Kumar", "8888888888", "male", null));
        _store.UpsertInvoice(new Invoice("i1", "INV-2026-0042", "p1", 500m, 0m, "pending", "2026-10-29"));
    }

    [Fact] public void SearchMatchesEveryWordInAnyOrder() =>
        Assert.Equal(["Asha Rao"], _store.SearchPatients("rao asha").Select(p => p.FullName));

    [Fact] public void SearchByPhonePart() =>
        Assert.Equal("Ravi Kumar", _store.SearchPatients("8888").Single().FullName);

    [Fact] public void EmptySearchListsEveryone() => Assert.Equal(2, _store.SearchPatients("").Count);

    [Fact] public void UpsertUpdatesInsteadOfDuplicating()
    {
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha R. Rao", "9999999999", "female", null));
        Assert.Equal(2, _store.PatientCount());
        Assert.Equal("Asha R. Rao", _store.GetPatient("p1")!.FullName);
    }

    [Fact]
    public void BillsShowThePatientAndWhatIsStillOwed()
    {
        _store.UpsertInvoice(new Invoice("i2", "L-261029-0001", "p2", 400m, 400m, "paid", "2026-10-29T05:00:00+00:00"));

        var all = _store.SearchBills("");
        Assert.Equal(["L-261029-0001", "INV-2026-0042"], all.Select(b => b.InvoiceNumber)); // newest first
        var owed = _store.SearchBills("", onlyUnpaid: true).Single();
        Assert.Equal(("Asha Rao", 500m), (owed.PatientName, owed.Balance));
        Assert.Equal("Ravi Kumar", _store.SearchBills("ravi").Single().PatientName);
        Assert.True(all[0].Provisional);
    }

    [Fact] public void ScanFindsAPatientIgnoringCaseAndWhitespace() =>
        Assert.IsType<ScanMatch.FoundPatient>(_store.ResolveScan(" irm-0007\r"));

    [Fact]
    public void ScanFindsABillAndItsPatient()
    {
        var match = Assert.IsType<ScanMatch.FoundInvoice>(_store.ResolveScan("inv-2026-0042"));
        Assert.Equal("Asha Rao", match.Patient!.FullName);
    }

    [Fact] public void UnknownScanIsReported() => Assert.IsType<ScanMatch.NotFound>(_store.ResolveScan("NOPE-1"));

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}

public class DashboardTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    public DashboardTests() => _store = new LocalStore(_path);

    [Fact]
    public void CountsTodaysVisitsTakingsAndWhatIsStillOwed()
    {
        _store.UpsertPatient(new Patient("p1", "IRM-1", "Asha", "+919876543210", null, null));
        _store.UpsertInvoice(new Invoice("i1", "INV1", "p1", 500m, 500m, "paid", "2026-10-29T05:00:00.0000000+00:00"));
        _store.UpsertInvoice(new Invoice("i2", "INV2", "p1", 400m, 100m, "partial", "2026-10-29T06:00:00+00:00"));
        _store.UpsertInvoice(new Invoice("i3", "INV3", "p1", 300m, 0m, "pending", "2026-10-28T06:00:00+00:00")); // yesterday
        _store.AddPayment(new LocalPayment("pay1", "i1", 500m, "cash", null, null, "2026-10-29T05:05:00.000Z", true));
        _store.AddPayment(new LocalPayment("pay2", "i2", 100m, "upi", null, null, "2026-10-29T06:05:00.000Z", false));
        _store.UpsertPatientTest(new PatientTest("t1", "p1", "CBC", "2026-10-29", "pending"));
        _store.UpsertPatientTest(new PatientTest("t2", "p1", "LFT", "2026-10-29", "completed"));

        var d = _store.GetDashboard("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z");

        Assert.Equal((2, 1, 600m), (d.VisitsToday, d.TestsToDo, d.TakingsToday));
        Assert.Equal((600m, 2), (d.UnpaidBalance, d.UnpaidBills)); // 300 still owed on INV2 + 300 on yesterday's INV3
    }

    [Fact]
    public void AnEmptyDatabaseIsAllZeros()
    {
        var d = _store.GetDashboard("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z");
        Assert.Equal(new DashboardNumbers(0, 0, 0m, 0m, 0, 0, 0), d);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
