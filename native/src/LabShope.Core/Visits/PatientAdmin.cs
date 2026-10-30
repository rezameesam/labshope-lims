using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record StandalonePatient(string FullName, string Phone, string? Gender, string? DateOfBirth, string? Email = null, string? Address = null, string? BloodGroup = null, bool AllowDuplicatePhone = false);

public sealed record AddPatientResult(bool Ok, string? Error, Patient? Patient = null, IReadOnlyList<Patient>? SamePhone = null);

/// <summary>A patient's tests and bills as the history panel shows them.</summary>
public sealed record PatientHistory(IReadOnlyList<PatientTest> Tests, IReadOnlyList<Invoice> Bills)
{
    public decimal Billed => Bills.Sum(b => b.TotalAmount);
    public decimal Owed => Bills.Sum(b => Math.Max(0m, b.TotalAmount - b.PaidAmount));
}

/// <summary>
/// The patient screen's website functions that need the server: adding a patient on their own, switching a patient off or on,
/// and listing the switched-off ones. The patient history reads what is already on this computer.
/// </summary>
public static class PatientAdmin
{
    public static PatientHistory HistoryOf(LocalStore store, string patientId) =>
        new(store.TestsOfPatient(patientId), store.InvoicesOfPatient(patientId));

    /// <summary>Adds a patient without a visit, as the website's "Add patient" does (same id format, same duplicate-phone warning).</summary>
    public static async Task<AddPatientResult> AddAsync(SupabaseApi api, LocalStore store, string organizationId, string? labId, string? userId, StandalonePatient input,
        Func<DateTimeOffset>? now = null, Func<string>? randomDigits = null, CancellationToken ct = default)
    {
        now ??= () => DateTimeOffset.Now;
        randomDigits ??= () => Random.Shared.Next(1000, 10000).ToString();

        if (string.IsNullOrWhiteSpace(labId)) return new(false, "This computer isn't set to a lab yet. Choose the lab in Settings first.");

        string name;
        try { name = PatientRules.CleanName(input.FullName); }
        catch (ArgumentException e) { return new(false, e.Message); }

        var phone = "";
        if (!string.IsNullOrWhiteSpace(input.Phone))
        {
            phone = PhoneNumbers.Normalize(input.Phone) ?? "";
            if (phone.Length == 0) return new(false, "Enter a valid phone number, or leave it empty.");
        }

        string? dob;
        try { dob = PatientRules.CleanBirthDate(input.DateOfBirth, DateOnly.FromDateTime(now().LocalDateTime)); }
        catch (ArgumentException e) { return new(false, e.Message); }

        string? email;
        try { email = PatientEmail.Clean(input.Email); }
        catch (ArgumentException e) { return new(false, e.Message); }

        if (phone.Length > 0 && !input.AllowDuplicatePhone && store.FindPatientsByPhone(PhoneNumbers.LookupVariants(phone)) is { Count: > 0 } same)
            return new(false, "A patient with this phone number already exists.", null, same);

        var id = Guid.NewGuid().ToString();
        var code = $"PAT{now():yy}{randomDigits()}";
        var gender = string.IsNullOrWhiteSpace(input.Gender) ? null : input.Gender.Trim();
        var row = new Dictionary<string, object?>
        {
            ["id"] = id,
            ["patient_id"] = code,
            ["full_name"] = name,
            ["phone"] = phone,
            ["email"] = email,
            ["address"] = string.IsNullOrWhiteSpace(input.Address) ? null : input.Address.Trim(),
            ["date_of_birth"] = dob,
            ["gender"] = gender,
            ["blood_group"] = string.IsNullOrWhiteSpace(input.BloodGroup) ? null : input.BloodGroup.Trim(),
            ["password_reset_required"] = false,
            ["organization_id"] = organizationId,
            ["lab_id"] = labId,
            ["created_by"] = userId,
        };

        var result = await api.InsertAsync("patients", row, ct);
        if (result.NetworkFailure) return new(false, "Adding a patient on their own needs an internet connection. (Register a visit instead to add them offline.)");
        if (!result.Ok)
            return new(false, result.Status is 401 or 403 ? "Your account isn't allowed to add patients."
                : result.Status == 409 ? "That patient could not be added because the ID is already used. Try again."
                : result.ErrorMessage ?? "The patient was not added.");

        var patient = new Patient(id, code, name, phone, gender, dob, Email: email);
        store.UpsertPatient(patient);
        return new(true, null, patient);
    }

    /// <summary>Switches a patient off (hidden from searches, like the website's deactivate) or back on.</summary>
    public static async Task<AdminResult> SetActiveAsync(SupabaseApi api, LocalStore store, string organizationId, Patient patient, bool active, CancellationToken ct = default)
    {
        var result = await api.PatchAsync("patients", $"id=eq.{patient.Id}&organization_id=eq.{organizationId}", new { is_active = active }, ct);
        if (result.NetworkFailure) return new(false, "Changing a patient needs an internet connection.");
        if (!result.Ok) return new(false, result.Status is 401 or 403 ? "Your account isn't allowed to change patients." : result.ErrorMessage ?? "The change was not saved.");
        if (result.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0)
            return new(false, "The server did not accept the change (patient not found, or your account isn't allowed to change patients).");

        if (active) store.UpsertPatient(patient with { Pending = false });
        else store.DeletePatient(patient.Id);
        return new(true, null);
    }

    /// <summary>The patients switched off on the server (they are not kept on this computer).</summary>
    public static async Task<(IReadOnlyList<Patient> Patients, string? Error)> LoadInactiveAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var (rows, failure) = await api.SelectAllAsync("patients",
            $"select=id,patient_id,full_name,phone,gender,date_of_birth&organization_id=eq.{organizationId}&is_active=eq.false&order=full_name.asc", maxRows: 5000, ct: ct);
        if (failure is not null)
            return ([], failure.NetworkFailure ? "Listing switched-off patients needs an internet connection." : failure.Status is 401 or 403 ? "Your account isn't allowed to see these patients." : failure.ErrorMessage ?? "Could not load the patients.");

        static string? Opt(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return (rows.Select(r => new Patient(r.GetProperty("id").GetString()!, Opt(r, "patient_id") ?? "", Opt(r, "full_name") ?? "", Opt(r, "phone") ?? "", Opt(r, "gender"), Opt(r, "date_of_birth"))).ToList(), null);
    }
}
