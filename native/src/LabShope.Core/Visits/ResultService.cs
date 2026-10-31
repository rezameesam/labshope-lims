using System.Globalization;
using System.Text.Json.Nodes;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>
/// Enters a test result on this PC (the worklist updates at once) and queues it for the server. The abnormal
/// flag follows the website's rule: when the test has a numeric normal range, the value decides it.
/// </summary>
public sealed class ResultService
{
    private readonly LocalStore _store;
    private readonly string _organizationId;
    private readonly string? _userId;
    private readonly Func<DateTimeOffset> _now;

    public ResultService(LocalStore store, string organizationId, string? userId, Func<DateTimeOffset>? now = null)
    {
        _store = store;
        _organizationId = organizationId;
        _userId = userId;
        _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    /// <summary>What the entry form shows before anything is typed: the unit and the reference range.</summary>
    public (string? Unit, string? RangeText) Defaults(string testName)
    {
        var c = _store.FindCatalogTest(testName);
        return (c?.Unit, c?.NormalRangeText ?? (c?.NormalMin is { } lo && c.NormalMax is { } hi ? $"{lo:0.##} - {hi:0.##}" : null));
    }

    /// <summary>Saves a multi-value result (such as a CBC). Abnormal when any row is out of its numeric range, or the person marks it.</summary>
    public PatientTest EnterPanel(string testId, IReadOnlyList<ResultItem> items, bool markedAbnormal = false)
    {
        var test = _store.GetPatientTest(testId) ?? throw new ArgumentException("That test isn't on this computer.");
        var kept = items.Where(i => !i.IsEmpty).ToList();
        if (kept.Count == 0 || kept.All(i => i.Value.Trim() == "")) throw new ArgumentException("Enter at least one value.");

        var abnormal = markedAbnormal || kept.Any(i => i.IsAbnormal);
        var itemsJson = ResultItem.ToJsonArray(kept);
        var enteredAt = _now().UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

        var done = test with
        {
            Status = "completed", Result = null, ResultValue = null, ResultUnit = null, NormalRangeText = null,
            IsAbnormal = abnormal, Waiting = true, ResultItemsJson = itemsJson,
        };

        var patch = new JsonObject
        {
            ["status"] = "completed", ["result"] = null, ["result_value"] = null, ["result_unit"] = null, ["normal_range_text"] = null,
            ["result_items"] = JsonNode.Parse(itemsJson), ["is_abnormal"] = abnormal,
            ["result_entered_by"] = _userId, ["result_entered_at"] = enteredAt, ["updated_by"] = _userId,
        };
        var payload = new JsonObject { ["id"] = testId, ["organization_id"] = _organizationId, ["patch"] = patch };

        _store.InTransaction(() =>
        {
            _store.UpsertPatientTest(done);
            if (_userId is not null) _store.SetTestEnteredBy(done.Id, _userId);
            _store.EnqueueVisit(new OutboxItem($"result-{testId}-{enteredAt}", payload.ToJsonString(), "pending", 0, null,
                _store.GetPatient(test.PatientId)?.FullName ?? "", 0m, Kind: "result"));
        });
        return done;
    }

    /// <summary>
    /// Sends a test to an external lab at a cost. On the server this posts "Outsourcing expense / Outsource payable" to the books
    /// automatically (an existing database rule), exactly as when it is done on the website. Works offline; sent with the next sync.
    /// </summary>
    public PatientTest Outsource(string testId, string externalLabId, string costText)
    {
        var test = _store.GetPatientTest(testId) ?? throw new ArgumentException("That test isn't on this computer.");
        var lab = _store.GetCatalog().ExternalLabList.FirstOrDefault(l => l.Id == externalLabId) ?? throw new ArgumentException("Pick an external lab.");
        if (!decimal.TryParse(costText.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var cost) || cost <= 0)
            throw new ArgumentException("Enter what the external lab charges (more than 0).");
        if (test.ExternalLabId is not null) throw new ArgumentException("This test has already been sent to an external lab.");

        var at = _now().UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        var updated = test with { ExternalLabId = lab.Id, OutsourceCost = cost, Waiting = true };
        var payload = new JsonObject
        {
            ["id"] = testId, ["organization_id"] = _organizationId,
            ["patch"] = new JsonObject { ["external_lab_id"] = lab.Id, ["outsource_cost"] = cost, ["outsourced_at"] = at, ["outsourced_by"] = _userId, ["updated_by"] = _userId },
        };
        _store.InTransaction(() =>
        {
            _store.UpsertPatientTest(updated);
            _store.EnqueueVisit(new OutboxItem($"outsource-{testId}", payload.ToJsonString(), "pending", 0, null, _store.GetPatient(test.PatientId)?.FullName ?? "", cost, Kind: "outsource"));
        });
        return updated;
    }

    public PatientTest Enter(string testId, string valueText, string? unit = null, bool markedAbnormal = false)
    {
        var test = _store.GetPatientTest(testId) ?? throw new ArgumentException("That test isn't on this computer.");
        valueText = valueText.Trim();
        if (valueText.Length == 0) throw new ArgumentException("Enter a result.");

        var catalog = _store.FindCatalogTest(test.TestName);
        var numeric = decimal.TryParse(valueText, NumberStyles.Float, CultureInfo.InvariantCulture, out var number);

        var abnormal = markedAbnormal;
        // A range may have only a lower or only an upper limit (CRP: up to 6); the website flags those too.
        if (numeric && (catalog?.NormalMin is not null || catalog?.NormalMax is not null))
            abnormal = (catalog.NormalMin is { } min && number < min) || (catalog.NormalMax is { } max && number > max);

        var finalUnit = string.IsNullOrWhiteSpace(unit) ? catalog?.Unit : unit.Trim();
        var rangeText = catalog?.NormalRangeText;
        var enteredAt = _now().UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

        var done = test with
        {
            Status = "completed", Result = numeric ? null : valueText, ResultValue = numeric ? number : null,
            ResultUnit = finalUnit, NormalRangeText = rangeText, IsAbnormal = abnormal, Waiting = true,
        };

        var patch = new JsonObject
        {
            ["status"] = "completed",
            ["result_value"] = numeric ? number : null,
            ["result"] = numeric ? null : valueText,
            ["result_unit"] = finalUnit,
            ["is_abnormal"] = abnormal,
            ["normal_range_text"] = rangeText,
            ["result_entered_by"] = _userId,
            ["result_entered_at"] = enteredAt,
            ["updated_by"] = _userId,
        };
        var payload = new JsonObject { ["id"] = testId, ["organization_id"] = _organizationId, ["patch"] = patch };

        _store.InTransaction(() =>
        {
            _store.UpsertPatientTest(done);
            if (_userId is not null) _store.SetTestEnteredBy(done.Id, _userId);
            // A second entry for the same test replaces the first that is still waiting to be sent.
            _store.EnqueueVisit(new OutboxItem($"result-{testId}-{enteredAt}", payload.ToJsonString(), "pending", 0, null,
                _store.GetPatient(test.PatientId)?.FullName ?? "", 0m, Kind: "result"));
        });
        return done;
    }

    /// <summary>
    /// Marks tests as being worked on (the website's "in progress"), at once on this PC and queued for the server like a result is. Only tests that are still
    /// waiting are started; anything already under way or finished is left alone. Returns how many were started.
    /// </summary>
    public int StartTesting(IEnumerable<string> testIds)
    {
        var started = 0;
        var startedAt = _now().UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        foreach (var id in testIds.Distinct())
        {
            var test = _store.GetPatientTest(id);
            if (test is null || test.Status != "pending" || !string.IsNullOrEmpty(test.ExternalLabId)) continue;

            var payload = new JsonObject
            {
                ["id"] = id,
                ["organization_id"] = _organizationId,
                ["patch"] = new JsonObject { ["status"] = "in_progress", ["updated_by"] = _userId },
            };
            _store.InTransaction(() =>
            {
                _store.UpsertPatientTest(test with { Status = "in_progress", Waiting = true });
                _store.EnqueueVisit(new OutboxItem($"result-{id}-start-{startedAt}", payload.ToJsonString(), "pending", 0, null,
                    _store.GetPatient(test.PatientId)?.FullName ?? "", 0m, Kind: "result"));
            });
            started++;
        }
        return started;
    }
}
