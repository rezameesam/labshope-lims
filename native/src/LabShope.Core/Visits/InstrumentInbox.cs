using System.Text.Json;
using System.Text.RegularExpressions;
using LabShope.Core.Analyzers;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>What accepting a machine result did.</summary>
public sealed record AcceptOutcome(bool Ok, string Message, string? TestId = null);

/// <summary>
/// Receives what lab machines send, finds the patient from the sample barcode (the patient code printed on the label, a bill number,
/// or a code printed earlier), and holds the result for a person to check. Accepting fills the right test's result with the machine's values.
/// </summary>
public sealed class InstrumentInbox
{
    private readonly LocalStore _store;
    private readonly ResultService _results;
    private readonly Func<DateTimeOffset> _now;

    public InstrumentInbox(LocalStore store, string organizationId, string? userId, Func<DateTimeOffset>? now = null)
    {
        _store = store;
        _now = now ?? (() => DateTimeOffset.UtcNow);
        _results = new ResultService(store, organizationId, userId, _now);
    }

    public static IReadOnlyList<InstrumentParameter> ParseParameters(string json)
    {
        try { return JsonSerializer.Deserialize<List<InstrumentParameter>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    /// <summary>Stores a result from a machine. Returns the entry (matched to a patient when the sample id is recognised).</summary>
    public InstrumentEntry Receive(InstrumentResult result)
    {
        var patientId = _store.ResolveScan(result.SampleId) switch
        {
            ScanMatch.FoundPatient p => p.Patient.Id,
            ScanMatch.FoundInvoice { Patient: not null } b => b.Patient.Id,
            _ => null,
        };
        var entry = new InstrumentEntry(Guid.NewGuid().ToString(), _now().UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), result.Protocol, result.SampleId,
            result.PatientName, patientId, JsonSerializer.Serialize(result.Parameters), "new",
            patientId is null ? "No patient matches this sample barcode." : null);
        _store.AddInstrumentEntry(entry);
        return entry;
    }

    /// <summary>The pending tests this result could fill in, best match first.</summary>
    public IReadOnlyList<PatientTest> Candidates(InstrumentEntry entry)
    {
        if (entry.PatientId is null) return [];
        var parameters = ParseParameters(entry.ParametersJson);
        var codes = parameters.Select(p => InstrumentCodes.Normalize(p.Code)).ToHashSet();

        return _store.SearchWorklist("", ["pending", "in_progress"], 5000).Select(r => r.Test)
            .Where(t => t.PatientId == entry.PatientId)
            .Select(t => (Test: t, Score: Score(t, codes, parameters)))
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score).Select(x => x.Test).ToList();
    }

    private static int Score(PatientTest test, HashSet<string> codes, IReadOnlyList<InstrumentParameter> parameters)
    {
        var panel = PanelDefaults.For(test.TestName);
        if (panel.Count > 0) return panel.Count(row => codes.Contains(InstrumentCodes.Normalize(row.Name)) || InstrumentCodes.Aliases(row.Name).Any(codes.Contains));
        // A single-value test matches when the machine reported a value with that test's name or code.
        return parameters.Any(p => InstrumentCodes.SameTest(p, test.TestName)) ? 1 : 0;
    }

    /// <summary>Fills the best-matching test with the machine's values and completes it (queued for the server like any result).</summary>
    public AcceptOutcome Accept(string entryId, string? testId = null)
    {
        var entry = _store.GetInstrumentEntry(entryId);
        if (entry is null) return new(false, "That result isn't on this computer.");
        if (entry.Status != "new") return new(false, "That result has already been dealt with.");
        if (entry.PatientId is null) return new(false, "No patient matches this sample barcode. Check the barcode and the patient.");

        var test = testId is null ? Candidates(entry).FirstOrDefault() : _store.GetPatientTest(testId);
        if (test is null || test.PatientId != entry.PatientId) return new(false, "This patient has no waiting test that these values belong to.");

        var parameters = ParseParameters(entry.ParametersJson);
        if (parameters.Count == 0) return new(false, "The machine sent no values in this result.");
        var panel = PanelDefaults.For(test.TestName);
        if (panel.Count > 0) _results.EnterPanel(test.Id, MergeIntoPanel(panel, parameters));
        else
        {
            // Never guess among several values: a haemoglobin must not end up in a blood-group test.
            var match = parameters.FirstOrDefault(p => InstrumentCodes.SameTest(p, test.TestName)) ?? (parameters.Count == 1 ? parameters[0] : null);
            if (match is null) return new(false, $"None of the machine's values clearly belong to {test.TestName}. Open the result and enter it by hand.");
            _results.Enter(test.Id, match.Value, match.Unit, match.FlaggedAbnormal);
        }

        _store.SetInstrumentStatus(entryId, "accepted", $"{test.TestName}");
        return new(true, $"{test.TestName} filled in from the machine.", test.Id);
    }

    public void Discard(string entryId) => _store.SetInstrumentStatus(entryId, "discarded");

    /// <summary>The standard panel rows with the machine's values; values the panel has no row for are added as extra rows (nothing is lost).</summary>
    public static IReadOnlyList<ResultItem> MergeIntoPanel(IReadOnlyList<ResultItem> panel, IReadOnlyList<InstrumentParameter> parameters)
    {
        var rows = panel.ToList();
        var used = new HashSet<int>();
        var extras = new List<ResultItem>();

        foreach (var p in parameters)
        {
            var code = InstrumentCodes.Normalize(p.Code);
            var index = rows.FindIndex(r => InstrumentCodes.Normalize(r.Name) == code || InstrumentCodes.Aliases(r.Name).Contains(code));
            if (index >= 0 && used.Add(index)) rows[index] = rows[index] with { Value = p.Value, Unit = rows[index].Unit.Length > 0 ? rows[index].Unit : p.Unit ?? "" };
            else if (index < 0)
            {
                var (min, max) = InstrumentCodes.ParseRange(p.Reference);
                extras.Add(new ResultItem(p.Name.Length > 0 ? p.Name : p.Code, p.Value, p.Unit ?? "", min, max, ""));
            }
        }
        return rows.Concat(extras).ToList();
    }
}

/// <summary>Machines name the same measurement in different ways (GRAN, NEUT#, GRA...). This lines them up.</summary>
public static class InstrumentCodes
{
    public static string Normalize(string code) => Regex.Replace(code ?? "", @"[^A-Za-z0-9%#]", "").ToUpperInvariant();

    private static readonly Dictionary<string, string[]> AliasTable = new()
    {
        ["GRAN"] = ["GRA", "GRAN#", "GRA#", "NEUT#", "NEU#", "NE#"],
        ["GRA%"] = ["GRAN%", "NEUT%", "NEU%", "NE%"],
        ["LYM"] = ["LYM#", "LY#"],
        ["LYM%"] = ["LY%"],
        ["MID"] = ["MID#", "MON#", "MONO#"],
        ["MID%"] = ["MON%", "MONO%"],
        ["RDW%"] = ["RDWCV", "RDW-CV", "RDW"],
        ["RDWA"] = ["RDWSD", "RDW-SD"],
        ["PLT"] = ["PLT#", "PLATELETS"],
        ["WBC"] = ["WBC#", "LEUK"],
        ["RBC"] = ["RBC#", "ERY"],
        ["HGB"] = ["HB", "HAEMOGLOBIN", "HEMOGLOBIN"],
        ["HCT"] = ["PCV"],
        ["LPCR"] = ["P-LCR", "PLCR"],
    };

    public static IReadOnlyList<string> Aliases(string code) =>
        AliasTable.TryGetValue(Normalize(code), out var list) ? list.Select(Normalize).ToList() : [];

    /// <summary>True when a single machine value is the result of the named test (by its name or a well-known code).</summary>
    public static bool SameTest(InstrumentParameter p, string testName)
    {
        var test = Normalize(testName);
        return Normalize(p.Name) == test || Normalize(p.Code) == test
            || Aliases(p.Code).Contains(test) || AliasTable.Any(kv => Normalize(kv.Key) == Normalize(p.Code) && kv.Value.Select(Normalize).Contains(test));
    }

    /// <summary>"3.5-10.0" -> ("3.5", "10.0"); anything else -> no range.</summary>
    public static (string Min, string Max) ParseRange(string? reference)
    {
        var m = Regex.Match(reference ?? "", @"^\s*(-?\d+(?:\.\d+)?)\s*[-–~]\s*(-?\d+(?:\.\d+)?)\s*$");
        return m.Success ? (m.Groups[1].Value, m.Groups[2].Value) : ("", "");
    }
}
