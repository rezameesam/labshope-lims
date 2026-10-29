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
