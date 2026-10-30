using System.Text.Json;
using System.Text.Json.Nodes;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record VisitTest(string TestName, decimal Price, bool InPackage = false);
public sealed record PackageRef(string Id, string Name, decimal Price);
/// <param name="NoPhone">The patient has no phone number (the visit is registered without one).</param>
/// <param name="AllowDuplicatePhone">Create a new patient even though the phone is already registered (family members often share one).</param>
public sealed record NewPatient(string FullName, string Phone, string? Gender = null, string? DateOfBirth = null, bool NoPhone = false, bool AllowDuplicatePhone = false, string? Email = null);

/// <summary>
/// The phone number is already registered with someone. The person registering decides: use that patient, or continue with a
/// new patient anyway (the same choice the website's "phone number already registered" warning gives).
/// </summary>
public sealed class DuplicatePhoneException(IReadOnlyList<Patient> matches, string phone) : Exception($"The phone number {phone} is already registered with {matches.Count} patient(s).")
{
    public IReadOnlyList<Patient> Matches { get; } = matches;
    public string Phone { get; } = phone;
}

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
    InitialPayment? Payment = null,
    decimal Discount = 0m);

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

    /// <summary>The discount the server will accept: whole paise, never negative, never more than the bill (the website's rule).</summary>
    public static decimal ClampDiscount(decimal discount, decimal gross) => Math.Min(Math.Max(PatientRules.Paise(discount), 0m), gross);

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
        if (input.Tests.Any(t => t.Price < 0)) throw new ArgumentException("A test price can't be negative.", nameof(input));
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
            // Not everyone has a phone. Without one the patient is never matched on phone.
            var phone = fresh.NoPhone ? "" : PhoneNumbers.Normalize(fresh.Phone) ?? throw new ArgumentException("Enter a valid phone number, or tick \"No phone number\".", nameof(input));
            var variants = phone.Length == 0 ? [] : PhoneNumbers.LookupVariants(phone);

            if (phone.Length > 0 && !fresh.AllowDuplicatePhone && _store.FindPatientsByPhone(variants) is { Count: > 0 } matches)
                throw new DuplicatePhoneException(matches, phone);

            var id = Guid.NewGuid().ToString();
            var code = $"PAT{_now():yy}{_randomDigits()}";
            var name = PatientRules.CleanName(fresh.FullName);
            var birth = PatientRules.CleanBirthDate(fresh.DateOfBirth, DateOnly.FromDateTime(_now().LocalDateTime));
            patientName = name;
            var email = PatientEmail.Clean(fresh.Email);
            _store.UpsertPatient(new Patient(id, code, name, phone, fresh.Gender, birth, Pending: true, Email: email));
            patient = NewPatientNode(id, code, name, phone, fresh.Gender, birth, variants, noPhone: phone.Length == 0, allowDuplicate: fresh.AllowDuplicatePhone, email: email);
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

        var gross = Total(input.Tests, input.Package);
        var discount = ClampDiscount(input.Discount, gross);
        if (discount > 0) payload["discount"] = discount;
        var total = gross - discount; // what the patient actually has to pay
        var patientId = patient["new"]?["id"]?.GetValue<string>() ?? patient["id"]!.GetValue<string>();
        var number = _store.NextLocalBillNumber(_now());

        Receipt? receipt = null;
        _store.InTransaction(() =>
        {
            _store.EnqueueVisit(new OutboxItem(visitId, payload.ToJsonString(), "pending", 0, null, patientName, total));
            // The bill exists on this PC straight away (its id is the visit id, as on the server); the server
            // gives it its official number when the visit is sent.
            _store.UpsertInvoice(new Invoice(visitId, number, patientId, total, 0m, "pending", _now().ToString("O"), discount));
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
        ? NewPatientNode(p.Id, p.PatientCode, p.FullName, p.Phone, p.Gender, p.DateOfBirth, [p.Phone], email: p.Email)
        : new JsonObject { ["id"] = p.Id };

    private static JsonNode NewPatientNode(string id, string code, string name, string phone, string? gender, string? dob, IReadOnlyList<string> variants, bool noPhone = false, bool allowDuplicate = false, string? email = null)
    {
        var node = new JsonObject
        {
            ["id"] = id, ["patient_code"] = code, ["full_name"] = name, ["phone"] = phone,
            ["gender"] = gender, ["date_of_birth"] = dob,
            ["phone_variants"] = new JsonArray(variants.Select(v => (JsonNode)JsonValue.Create(v)!).ToArray()),
        };
        if (email is not null) node["email"] = email;
        if (noPhone) node["no_phone"] = true;
        if (allowDuplicate) node["allow_duplicate_phone"] = true;
        return new JsonObject { ["new"] = node };
    }
}
