using System.Text.Json.Nodes;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record PatientEdit(string FullName, string Phone, string? Gender, string? DateOfBirth, string? Email = null);

/// <summary>An email address typed by a person: trimmed and lower case, empty when there is none. Throws when it does not look like an address.</summary>
public static class PatientEmail
{
    public static string? Clean(string? text)
    {
        var value = text?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(value)) return null;
        if (value.Length > 254 || value.Contains(' ') || value.Count(c => c == '@') != 1 || value.StartsWith('@') || value.EndsWith('@') || !value.Split('@')[1].Contains('.') || value.EndsWith('.'))
            throw new ArgumentException("Enter a valid email address, or leave it empty.");
        return value;
    }
}

/// <summary>
/// Changes a patient's details on this PC at once and queues the change for the server. If the server later
/// refuses it, the old details come back (the payload remembers them).
/// </summary>
public sealed class PatientService
{
    private readonly LocalStore _store;
    private readonly string _organizationId;

    public PatientService(LocalStore store, string organizationId)
    {
        _store = store;
        _organizationId = organizationId;
    }

    public Patient Edit(string patientId, PatientEdit edit)
    {
        var patient = _store.GetPatient(patientId) ?? throw new ArgumentException("That patient isn't on this computer.");
        var name = PatientRules.CleanName(edit.FullName);
        // The phone is optional (some patients have none), and a number may be shared by family members.
        var phone = string.IsNullOrWhiteSpace(edit.Phone) ? "" : PhoneNumbers.Normalize(edit.Phone) ?? throw new ArgumentException("Enter a valid phone number, or leave it empty.");
        var dob = PatientRules.CleanBirthDate(edit.DateOfBirth, DateOnly.FromDateTime(DateTime.Today));
        var gender = string.IsNullOrWhiteSpace(edit.Gender) ? null : edit.Gender.Trim();
        // The email is only sent when it was changed here: a patient whose email this PC doesn't know yet must not have it wiped by a blank box.
        var email = PatientEmail.Clean(edit.Email);
        var emailChanged = email != patient.Email && !(email is null && patient.Email is null);

        var changed = patient with { FullName = name, Phone = phone, Gender = gender, DateOfBirth = dob, Email = emailChanged ? email : patient.Email };
        if (changed == patient) return patient;

        // A patient that has never reached the server travels with its visit, which already carries the details:
        // keep the visit's copy in step instead of queuing an edit for a row that doesn't exist yet.
        if (patient.Pending)
        {
            _store.InTransaction(() =>
            {
                _store.UpsertPatient(changed);
                _store.UpdateWaitingVisitPatient(patientId, name, phone, gender, dob, phone.Length == 0 ? [] : PhoneNumbers.LookupVariants(phone), changed.Email);
            });
            return changed;
        }

        var payload = new JsonObject
        {
            ["id"] = patientId,
            ["organization_id"] = _organizationId,
            ["patch"] = new JsonObject { ["full_name"] = name, ["phone"] = phone, ["gender"] = gender, ["date_of_birth"] = dob },
            ["previous"] = new JsonObject { ["full_name"] = patient.FullName, ["phone"] = patient.Phone, ["gender"] = patient.Gender, ["date_of_birth"] = patient.DateOfBirth, ["email"] = patient.Email },
        };
        if (emailChanged) payload["patch"]!["email"] = email;
        _store.InTransaction(() =>
        {
            _store.UpsertPatient(changed);
            _store.EnqueueVisit(new OutboxItem($"patient-{patientId}-{Guid.NewGuid():N}", payload.ToJsonString(), "pending", 0, null, name, 0m, Kind: "patient"));
        });
        return changed;
    }
}
