using LabShope.Core.Analyzers;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class InstrumentInboxTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly InstrumentInbox _inbox;

    public InstrumentInboxTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog([new CatalogTest("t1", "CBC", "CBC", 300m, null), new CatalogTest("t2", "HB", "Haemoglobin", 200m, null, "g/dL", null, 13m, 17m)], [], [], [], []));
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha Rao", "+919876543210", "female", null));
        _inbox = new InstrumentInbox(_store, Org, "user-1", () => new DateTimeOffset(2026, 10, 29, 12, 0, 0, TimeSpan.Zero));
    }

    private void Order(params string[] tests) =>
        new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-29", tests.Select(t => new VisitTest(t, 100)).ToList(), ExistingPatient: _store.GetPatient("p1")));

    private static InstrumentResult Cbc(string sample = "IRM-0007") => new(sample, "ASTM",
    [
        new("WBC", "White cells", "6.1", "10^9/L", "3.5-10.0", "N"), new("HGB", "Haemoglobin", "9.8", "g/dL", "11.5-16.5", "L"),
        new("NEUT#", "Neutrophils", "3.9", "10^9/L", "1.2-8.0", "N"), new("PLT", "Platelets", "250", "10^9/L", "100-400", "N"),
        new("XYZ", "Special marker", "1.5", "U", "1-2", null),
    ]);

    [Fact]
    public void AResultIsMatchedToThePatientFromTheSampleBarcodeAndHeldForReview()
    {
        Order("CBC");
        var entry = _inbox.Receive(Cbc());

        Assert.Equal(("new", "p1", null), (entry.Status, entry.PatientId, entry.Note));
        Assert.Equal(5, entry.ParameterCount);
        Assert.Equal(1, _store.NewInstrumentCount());
        Assert.Empty(_store.SearchWorklist("", ["completed"])); // nothing is saved until a person accepts it
    }

    [Fact]
    public void AnUnknownBarcodeIsHeldWithAnExplanationNotDropped()
    {
        var entry = _inbox.Receive(Cbc("NOPE-1"));
        Assert.Null(entry.PatientId);
        Assert.Contains("No patient matches", entry.Note);
        Assert.Equal("No patient matches this sample barcode. Check the barcode and the patient.", _inbox.Accept(entry.Id).Message);
    }

    [Fact]
    public void ALabelPrintedBeforeSyncStillMatches()
    {
        Order("CBC");
        _store.AddAlias("PAT264242", "patient", "p1");
        Assert.Equal("p1", _inbox.Receive(Cbc("PAT264242")).PatientId);
    }

    [Fact]
    public void AcceptingACbcFillsTheStandardPanelAndKeepsEveryValue()
    {
        Order("CBC", "Haemoglobin");
        var entry = _inbox.Receive(Cbc());

        var outcome = _inbox.Accept(entry.Id);

        Assert.True(outcome.Ok, outcome.Message);
        var test = _store.GetPatientTest(outcome.TestId!)!;
        Assert.Equal(("CBC", "completed", true), (test.TestName, test.Status, test.IsAbnormal)); // HGB 9.8 is below 11.5
        var rows = ResultItem.ParseAll(test.ResultItemsJson).ToDictionary(r => r.Name);
        Assert.Equal("6.1", rows["WBC"].Value);
        Assert.Equal("9.8", rows["HGB"].Value);
        Assert.Equal("3.9", rows["GRAN"].Value);                  // the machine called it NEUT#
        Assert.Equal("250", rows["PLT"].Value);
        Assert.Equal(("1.5", "U", "1", "2"), (rows["Special marker"].Value, rows["Special marker"].Unit, rows["Special marker"].Min, rows["Special marker"].Max)); // a value the panel has no row for is kept, under the machine's name
        Assert.Equal("accepted", _store.GetInstrumentEntry(entry.Id)!.Status);
        Assert.Equal(2, _store.OutboxCounts().Pending); // the visit, plus the queued result
    }

    [Fact]
    public void ASingleValueResultFillsTheMatchingSimpleTest()
    {
        Order("Haemoglobin");
        var entry = _inbox.Receive(new InstrumentResult("IRM-0007", "HL7", [new("HGB", "Haemoglobin", "11.2", "g/dL", "13-17", "L")]));

        var outcome = _inbox.Accept(entry.Id);

        Assert.True(outcome.Ok, outcome.Message);
        var test = _store.GetPatientTest(outcome.TestId!)!;
        Assert.Equal((11.2m, "g/dL", true), (test.ResultValue, test.ResultUnit, test.IsAbnormal));
    }

    [Fact]
    public void RefusesWhenThePatientHasNoWaitingTestThatTheValuesBelongTo()
    {
        Order("Haemoglobin"); // waiting for a haemoglobin, but the machine sent glucose
        var other = new InstrumentResult("IRM-0007", "ASTM", [new("GLU", "Glucose", "95", "mg/dL", null, null)]);
        var entry = _inbox.Receive(other);

        Assert.Contains("no waiting test", _inbox.Accept(entry.Id).Message);
        Assert.Equal("new", _store.GetInstrumentEntry(entry.Id)!.Status); // still there to deal with
    }

    [Fact]
    public void ADealtWithResultCannotBeAcceptedTwice()
    {
        Order("CBC");
        var entry = _inbox.Receive(Cbc());
        Assert.True(_inbox.Accept(entry.Id).Ok);
        Assert.Contains("already", _inbox.Accept(entry.Id).Message);
        Assert.Single(_store.SearchWorklist("", ["completed"]));
    }

    [Fact]
    public void DiscardingLeavesTheWorklistAlone()
    {
        Order("CBC");
        var entry = _inbox.Receive(Cbc());
        _inbox.Discard(entry.Id);
        Assert.Equal(0, _store.NewInstrumentCount());
        Assert.Single(_store.SearchWorklist("", ["pending"]));
    }

    [Theory]
    [InlineData("GRAN", "NEUT#", true)]
    [InlineData("GRA%", "NEU%", true)]
    [InlineData("RDW%", "RDW-CV", true)]
    [InlineData("RDWa", "RDW-SD", true)]
    [InlineData("HGB", "Hb", true)]
    [InlineData("HGB", "WBC", false)]
    public void KnowsWhichMachineNamesAreTheSameMeasurement(string row, string machine, bool same) =>
        Assert.Equal(same, InstrumentCodes.Normalize(row) == InstrumentCodes.Normalize(machine) || InstrumentCodes.Aliases(row).Contains(InstrumentCodes.Normalize(machine)));

    [Fact]
    public void ReadsARangeIfTheMachineGaveOne()
    {
        Assert.Equal(("3.5", "10.0"), InstrumentCodes.ParseRange("3.5-10.0"));
        Assert.Equal(("", ""), InstrumentCodes.ParseRange("Negative"));
        Assert.Equal(("", ""), InstrumentCodes.ParseRange(null));
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}

public class InstrumentSettingsTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    public InstrumentSettingsTests() => _store = new LocalStore(_path);

    [Fact]
    public void AreRememberedPerComputerAndDefaultToOff()
    {
        Assert.Equal(new InstrumentSettings(), InstrumentSettings.Load(_store));
        new InstrumentSettings(NetworkEnabled: true, NetworkPort: 5100, SerialEnabled: true, SerialPort: "COM3", SerialBaud: 19200, AutoAccept: true).Save(_store);

        var back = InstrumentSettings.Load(_store);
        Assert.Equal((true, 5100, "COM3", 19200, true), (back.NetworkEnabled, back.NetworkPort, back.SerialPort, back.SerialBaud, back.AutoAccept));
    }

    [Fact]
    public void ExplainsWhatIsWrongInPlainWords()
    {
        Assert.Null(new InstrumentSettings().Problem()); // off is fine
        Assert.Contains("1024", new InstrumentSettings(NetworkEnabled: true, NetworkPort: 80).Problem());
        Assert.Contains("COM", new InstrumentSettings(SerialEnabled: true, SerialPort: "").Problem());
        Assert.Contains("baud", new InstrumentSettings(SerialEnabled: true, SerialPort: "COM1", SerialBaud: 5).Problem());
        Assert.Null(new InstrumentSettings(NetworkEnabled: true, NetworkPort: 5000, SerialEnabled: true, SerialPort: "COM1").Problem());
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
