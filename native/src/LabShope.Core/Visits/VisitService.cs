using System.Text.Json;
using System.Text.Json.Nodes;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record VisitTest(string TestName, decimal Price, bool InPackage = false);
public sealed record PackageRef(string Id, string Name, decimal Price);
public sealed record NewPatient(string FullName, string Phone, string? Gender = null, string? DateOfBirth = null);

public sealed record RegisterVisitInput(
    string OrganizationId,
    string? LabId,
    string TestDate,
    IReadOnlyList<VisitTest> Tests,
    Patient? ExistingPatient = null,
    NewPatient? NewPatient = null,
    string? CollectionCenterId = null,
    string? Notes = null,
    PackageRef? Package = null,
    string? ReferralDoctorId = null,
    string? ReferralCustomName = null,
    InitialPayment? Payment = null);

/// <summary>Money collected at the counter while registering.</summary>
public sealed record InitialPayment(decimal Amount, string Method = "cash", string? TransactionId = null);

public sealed record RegisteredVisit(string VisitId, string PatientName, decimal Total, bool ReusedPatient, Receipt? Receipt = null, string InvoiceNumber = "", string PatientId = "");

/// <summary>
/// Registers a visit on this PC first (patient + tests + total), queues it to send, and returns at once.
/// Nothing here touches the network, so registration is instant with or without internet.
/// </summary>
public sealed class VisitService
{
    private readonly LocalStore _store;
    private readonly Func<DateTimeOffset> _now;
    private readonly Func<int> _randomDigits;

    public VisitService(LocalStore store, Func<DateTimeOffset>? now = null, Func<int>? randomDigits = null)
    {
        _store = store;
        _now = now ?? (() => DateTimeOffset.UtcNow);
        _randomDigits = randomDigits ?? (() => Random.Shared.Next(1000, 10000));
    }

    /// <summary>The price rules the server uses: a package replaces the prices of the tests inside it.</summary>
    public static decimal Total(IReadOnlyList<VisitTest> tests, PackageRef? package)
    {
        var hasPackage = package is not null && tests.Any(t => t.InPackage);
        var testTotal = tests.Sum(t => hasPackage && t.InPackage ? 0 : Math.Max(t.Price, 0));
        return testTotal + (hasPackage ? Math.Max(package!.Price, 0) : 0);
    }

    public RegisteredVisit Register(RegisterVisitInput input)
    {
        if (input.Tests.Count == 0) throw new ArgumentException("Pick at least one test.", nameof(input));
        if (input.ExistingPatient is null && input.NewPatient is null) throw new ArgumentException("Pick or enter a patient.", nameof(input));

        var reused = false;
        JsonNode patient;
        string patientName;

        if (input.ExistingPatient is { } existing)
        {
            patientName = existing.FullName;
            patient = PatientRef(existing);
        }
        else
        {
            var fresh = input.NewPatient!;
            var phone = PhoneNumbers.Normalize(fresh.Phone) ?? throw new ArgumentException("Enter a valid phone number.", nameof(input));
            var variants = PhoneNumbers.LookupVariants(phone);
            var match = _store.FindPatientByPhone(variants);

            if (match is not null)
            {
                reused = true;
                patientName = match.FullName;
                patient = PatientRef(match);
            }
            else
            {
                var id = Guid.NewGuid().ToString();
                var code = $"PAT{_now():yy}{_randomDigits()}";
                var name = fresh.FullName.Trim();
                patientName = name;
                _store.UpsertPatient(new Patient(id, code, name, phone, fresh.Gender, fresh.DateOfBirth, Pending: true));
                patient = NewPatientNode(id, code, name, phone, fresh.Gender, fresh.DateOfBirth, variants);
            }
        }

        var visitId = Guid.NewGuid().ToString();
        // Each ordered test gets its id now, so a result can be entered offline and still reach the right row.
        var testIds = input.Tests.Select(_ => Guid.NewGuid().ToString()).ToList();
        var payload = new JsonObject
        {
            ["visit_id"] = visitId,
            ["organization_id"] = input.OrganizationId,
            ["lab_id"] = input.LabId,
            ["collection_center_id"] = input.CollectionCenterId,
            ["test_date"] = input.TestDate,
            ["notes"] = input.Notes,
            ["collected_at"] = _now().ToString("O"),
            ["patient"] = patient,
            ["tests"] = new JsonArray(input.Tests.Select((t, n) => (JsonNode)new JsonObject
            {
                ["id"] = testIds[n], ["test_name"] = t.TestName, ["price"] = t.Price, ["in_package"] = t.InPackage,
            }).ToArray()),
            ["package"] = input.Package is null ? null : new JsonObject { ["id"] = input.Package.Id, ["name"] = input.Package.Name, ["price"] = input.Package.Price },
            ["referral"] = input.ReferralDoctorId is null ? null : new JsonObject { ["doctor_id"] = input.ReferralDoctorId, ["custom_name"] = input.ReferralCustomName },
        };

        var total = Total(input.Tests, input.Package);
        var patientId = patient["new"]?["id"]?.GetValue<string>() ?? patient["id"]!.GetValue<string>();
        var number = _store.NextLocalBillNumber(_now());

        Receipt? receipt = null;
        _store.InTransaction(() =>
        {
            _store.EnqueueVisit(new OutboxItem(visitId, payload.ToJsonString(), "pending", 0, null, patientName, total));
            // The bill exists on this PC straight away (its id is the visit id, as on the server); the server
            // gives it its official number when the visit is sent.
            _store.UpsertInvoice(new Invoice(visitId, number, patientId, total, 0m, "pending", _now().ToString("O")));
            // ...and its tests are on the worklist at once, so the bench can start before anything is sent.
            for (var n = 0; n < input.Tests.Count; n++)
                _store.UpsertPatientTest(new PatientTest(testIds[n], patientId, input.Tests[n].TestName, input.TestDate, "pending"));
            if (input.Payment is { Amount: > 0 } pay)
                receipt = new PaymentService(_store, input.OrganizationId, _now).Record(new PaymentInput(visitId, pay.Amount, pay.Method, pay.TransactionId));
        });
        return new RegisteredVisit(visitId, patientName, total, reused, receipt, number, patientId);
    }

    /// <summary>A patient that only exists on this PC travels with the visit so the server can create it.</summary>
    private static JsonNode PatientRef(Patient p) => p.Pending
        ? NewPatientNode(p.Id, p.PatientCode, p.FullName, p.Phone, p.Gender, p.DateOfBirth, [p.Phone])
        : new JsonObject { ["id"] = p.Id };

    private static JsonNode NewPatientNode(string id, string code, string name, string phone, string? gender, string? dob, IReadOnlyList<string> variants) =>
        new JsonObject
        {
            ["new"] = new JsonObject
            {
                ["id"] = id, ["patient_code"] = code, ["full_name"] = name, ["phone"] = phone,
                ["gender"] = gender, ["date_of_birth"] = dob,
                ["phone_variants"] = new JsonArray(variants.Select(v => (JsonNode)JsonValue.Create(v)!).ToArray()),
            },
        };
}
