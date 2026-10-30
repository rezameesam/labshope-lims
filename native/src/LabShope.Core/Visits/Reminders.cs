using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record Reminder(string Id, string PatientId, string Type, string Title, string Message, string ReminderDate, string? DueDate, bool Done)
{
    public string TypeText => Type.Replace('_', ' ');
    public string DateText => Dates.FromIso(ReminderDate);
    public string DueText => DueDate is null ? "" : Dates.FromIso(DueDate);
    /// <summary>Not done and its date has passed.</summary>
    public bool IsOverdue(DateOnly today) => !Done && DateOnly.TryParse(ReminderDate, out var d) && d < today;
    public bool IsToday(DateOnly today) => !Done && DateOnly.TryParse(ReminderDate, out var d) && d == today;
}

public sealed record ReminderResult(bool Ok, string? Error = null);

/// <summary>
/// Patient reminders (follow-up, checkup, payment, results ready, custom), the same <c>patient_reminders</c> rows the website shows.
/// Done online, straight against the server, so both apps always see the same list. Nothing is sent to the patient from here.
/// </summary>
public static class Reminders
{
    public static readonly string[] Types = ["follow_up", "checkup", "payment", "test_result", "custom"];

    public static async Task<(IReadOnlyList<Reminder> Items, string? Error)> LoadAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var (rows, failure) = await api.SelectAllAsync("patient_reminders",
            $"select=id,patient_id,reminder_type,title,message,reminder_date,due_date,is_completed&organization_id=eq.{organizationId}&order=reminder_date.asc,id.asc", ct: ct);
        if (failure is not null) return ([], Describe(failure, "Could not load the reminders."));

        static string? S(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return (rows.Select(r => new Reminder(S(r, "id")!, S(r, "patient_id") ?? "", S(r, "reminder_type") ?? "custom", S(r, "title") ?? "", S(r, "message") ?? "",
            S(r, "reminder_date") ?? "", S(r, "due_date"), r.TryGetProperty("is_completed", out var d) && d.ValueKind == JsonValueKind.True)).ToList(), null);
    }

    /// <summary>Adds a reminder, or changes the one with <paramref name="id"/>.</summary>
    public static async Task<ReminderResult> SaveAsync(SupabaseApi api, string organizationId, string? id, string patientId, string type, string title, string message,
        string reminderDate, string? dueDate, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(patientId)) return new(false, "Choose a patient.");
        if (string.IsNullOrWhiteSpace(title)) return new(false, "Give the reminder a title.");
        if (!DateOnly.TryParse(reminderDate, out _)) return new(false, "Enter the reminder date.");
        if (!string.IsNullOrWhiteSpace(dueDate) && !DateOnly.TryParse(dueDate, out _)) return new(false, "The due date isn't a valid date.");

        var row = new Dictionary<string, object?>
        {
            ["patient_id"] = patientId,
            ["organization_id"] = organizationId,
            ["reminder_type"] = Types.Contains(type) ? type : "custom",
            ["title"] = title.Trim(),
            ["message"] = string.IsNullOrWhiteSpace(message) ? null : message.Trim(),
            ["reminder_date"] = reminderDate,
            ["due_date"] = string.IsNullOrWhiteSpace(dueDate) ? null : dueDate,
            ["notification_method"] = "none",
        };
        var res = id is null
            ? await api.InsertAsync("patient_reminders", row, ct)
            : await api.PatchAsync("patient_reminders", $"id=eq.{id}&organization_id=eq.{organizationId}", row, ct);
        return Outcome(res, id is not null, "Could not save the reminder.");
    }

    public static async Task<ReminderResult> SetDoneAsync(SupabaseApi api, string organizationId, string id, bool done, DateTimeOffset now, CancellationToken ct = default)
    {
        var res = await api.PatchAsync("patient_reminders", $"id=eq.{id}&organization_id=eq.{organizationId}",
            new Dictionary<string, object?> { ["is_completed"] = done, ["completed_at"] = done ? now.UtcDateTime.ToString("o") : null }, ct);
        return Outcome(res, true, "Could not update the reminder.");
    }

    public static async Task<ReminderResult> DeleteAsync(SupabaseApi api, string organizationId, string id, CancellationToken ct = default)
    {
        var res = await api.DeleteAsync("patient_reminders", $"id=eq.{id}&organization_id=eq.{organizationId}", ct);
        return Outcome(res, true, "Could not delete the reminder.");
    }

    /// <summary>An edit, tick or delete that matched no row (already gone, or not allowed) is a failure, not a success.</summary>
    private static ReminderResult Outcome(ApiResult r, bool mustMatch, string fallback) =>
        !r.Ok ? new(false, Describe(r, fallback))
        : mustMatch && r.Body is { ValueKind: JsonValueKind.Array } a && a.GetArrayLength() == 0 ? new(false, "That reminder is gone or you aren't allowed to change it.")
        : new(true);

    private static string Describe(ApiResult r, string fallback) =>
        r.NetworkFailure ? "Reminders need an internet connection." : r.Status is 401 or 403 ? "Your account isn't allowed to do that." : r.ErrorMessage ?? fallback;
}

/// <summary>A reminder with the patient's name, for the list.</summary>
public sealed record ReminderRow(Reminder Reminder, string PatientName, DateOnly Today)
{
    public string Id => Reminder.Id;
    public string DateText => Reminder.DateText;
    public string TypeText => Reminder.TypeText;
    public string Title => Reminder.Title;
    public string DueText => Reminder.DueText;
    public bool Done => Reminder.Done;
    public string StateText => Reminder.Done ? "Done" : Reminder.IsOverdue(Today) ? "Overdue" : Reminder.IsToday(Today) ? "Today" : "Coming";

    /// <summary>The filter the screen offers: "To do", "Overdue", "Done" or "All".</summary>
    public static IEnumerable<ReminderRow> Filter(IEnumerable<ReminderRow> rows, string filter) => filter switch
    {
        "To do" => rows.Where(r => !r.Done),
        "Overdue" => rows.Where(r => r.Reminder.IsOverdue(r.Today)),
        "Done" => rows.Where(r => r.Done),
        _ => rows,
    };
}
