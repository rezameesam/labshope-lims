using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class PhoneNumberTests
{
    [Theory]
    [InlineData("9876543210", "+919876543210")]
    [InlineData("09876543210", "+919876543210")]
    [InlineData("+91 98765 43210", "+919876543210")]
    [InlineData("0091 9876543210", "+919876543210")]
    public void NormalizesToStorageForm(string input, string expected) => Assert.Equal(expected, PhoneNumbers.Normalize(input));

    [Theory]
    [InlineData("")] [InlineData("123")] [InlineData("abc")]
    public void RejectsUnusableNumbers(string input) => Assert.Null(PhoneNumbers.Normalize(input));

    [Fact]
    public void LookupVariantsCoverEveryWayItMayBeStored() =>
        Assert.Superset(new HashSet<string> { "+919876543210", "919876543210", "9876543210", "09876543210" },
            PhoneNumbers.LookupVariants("9876543210").ToHashSet());
}

public class VisitServiceTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly VisitService _visits;

    public VisitServiceTests()
    {
        _store = new LocalStore(_path);
        _visits = new VisitService(_store, () => new DateTimeOffset(2026, 10, 29, 4, 0, 0, TimeSpan.Zero), () => 4242);
    }

    private static RegisterVisitInput Input(NewPatient? fresh = null, Patient? existing = null, IReadOnlyList<VisitTest>? tests = null, PackageRef? package = null) =>
        new("org-1", "lab-1", "2026-10-29", tests ?? [new VisitTest("CBC", 300), new VisitTest("LFT", 450)], existing, fresh, Package: package);

    [Fact]
    public void RegistersANewPatientAndQueuesTheVisitWithoutTheNetwork()
    {
        var visit = _visits.Register(Input(new NewPatient("  Asha Rao ", "98765 43210", "female")));

        Assert.Equal(750m, visit.Total);
        Assert.Equal("Asha Rao", visit.PatientName);
        Assert.False(visit.ReusedPatient);

        var local = _store.SearchPatients("asha").Single();
        Assert.True(local.Pending);
        Assert.Equal("PAT264242", local.PatientCode);
        Assert.Equal("+919876543210", local.Phone);

        var queued = _store.GetVisit(visit.VisitId)!;
        Assert.Equal("pending", queued.Status);
        var payload = JsonDocument.Parse(queued.PayloadJson).RootElement;
        Assert.Equal(local.Id, payload.GetProperty("patient").GetProperty("new").GetProperty("id").GetString());
        Assert.Equal(2, payload.GetProperty("tests").GetArrayLength());
        Assert.Equal("org-1", payload.GetProperty("organization_id").GetString());
    }

    [Fact]
    public void ReusesAPatientWithTheSamePhoneInAnyFormat()
    {
        _store.UpsertPatient(new Patient("server-1", "IRM-0001", "Asha Rao", "+919876543210", null, null));

        var visit = _visits.Register(Input(new NewPatient("Asha R", "09876543210")));

        Assert.True(visit.ReusedPatient);
        Assert.Equal(1, _store.PatientCount());
        var payload = JsonDocument.Parse(_store.GetVisit(visit.VisitId)!.PayloadJson).RootElement;
        Assert.Equal("server-1", payload.GetProperty("patient").GetProperty("id").GetString());
    }

    [Fact]
    public void ASyncedPatientTravelsAsJustItsId()
    {
        var patient = new Patient("server-1", "IRM-0001", "Asha Rao", "+919876543210", null, null);
        var payload = JsonDocument.Parse(_store.GetVisit(_visits.Register(Input(existing: patient)).VisitId)!.PayloadJson).RootElement;
        Assert.False(payload.GetProperty("patient").TryGetProperty("new", out _));
    }

    [Fact]
    public void APendingPatientTravelsWithTheVisitSoTheServerCanCreateIt()
    {
        var pending = new Patient("local-1", "PAT264242", "Asha Rao", "+919876543210", null, null, Pending: true);
        var payload = JsonDocument.Parse(_store.GetVisit(_visits.Register(Input(existing: pending)).VisitId)!.PayloadJson).RootElement;
        Assert.Equal("local-1", payload.GetProperty("patient").GetProperty("new").GetProperty("id").GetString());
    }

    [Fact]
    public void APackageReplacesThePricesOfTheTestsInsideIt()
    {
        var tests = new[] { new VisitTest("CBC", 300, InPackage: true), new VisitTest("LFT", 450, InPackage: true), new VisitTest("Vitamin D", 900) };
        Assert.Equal(1400m, VisitService.Total(tests, new PackageRef("pk1", "Basic", 500m)));
    }

    [Fact]
    public void RefusesBadInput()
    {
        Assert.Throws<ArgumentException>(() => _visits.Register(Input(new NewPatient("A", "123"))));          // bad phone
        Assert.Throws<ArgumentException>(() => _visits.Register(Input(new NewPatient("A", "9876543210"), tests: [])));  // no tests
        Assert.Throws<ArgumentException>(() => _visits.Register(Input()));                                     // no patient
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
