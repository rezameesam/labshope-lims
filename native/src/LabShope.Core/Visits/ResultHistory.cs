using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record ResultHistoryEntry(string ChangedAt, string? ChangedBy, string Action, string Summary)
{
    public string When => Dates.FromMoment(ChangedAt);
    public string What => Action.Replace('_', ' ');
}

/// <summary>Who changed a test's result or status and when (the website's audit history), read from the server.</summary>
public static class ResultHistory
{
    public static async Task<(IReadOnlyList<ResultHistoryEntry> Entries, string? Error)> LoadAsync(SupabaseApi api, string organizationId, string patientTestId, CancellationToken ct = default)
    {
        var res = await api.SelectAsync("patient_test_audit", $"select=action,changed_by,changed_at,old_values,new_values&patient_test_id=eq.{patientTestId}&order=changed_at.desc", ct);
        if (!res.Ok) return ([], res.NetworkFailure ? "The history needs an internet connection." : res.Status is 401 or 403 ? "Your account isn't allowed to see this history." : res.ErrorMessage ?? "Could not load the history.");

        static string? S(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var rows = res.Body is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray().ToList() : [];
        var ids = rows.Select(r => S(r, "changed_by")).Where(i => i is not null).Distinct().ToList();
        var names = await BillingAdmin.StaffNamesAsync(api, organizationId, ids!, ct);

        return (rows.Select(r => new ResultHistoryEntry(S(r, "changed_at") ?? "", S(r, "changed_by") is { } id ? names.GetValueOrDefault(id, "Unknown staff") : null, S(r, "action") ?? "",
            Describe(S(r, "action") ?? "", r.TryGetProperty("old_values", out var o) ? o : default, r.TryGetProperty("new_values", out var n) ? n : default))).ToList(), null);
    }

    public static string Describe(string action, JsonElement oldValues, JsonElement newValues)
    {
        static string? V(JsonElement e, string n) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : null;
        static string Show(string? s) => string.IsNullOrWhiteSpace(s) ? "(empty)" : s;
        return action switch
        {
            "created" => $"Test added ({Show(V(newValues, "test_name"))})",
            "result_updated" => $"Result changed from {Show(V(oldValues, "result"))} to {Show(V(newValues, "result"))}" +
                (V(oldValues, "status") != V(newValues, "status") ? $"; status {Show(V(oldValues, "status"))} to {Show(V(newValues, "status"))}" : ""),
            "status_changed" => $"Status changed from {Show(V(oldValues, "status"))} to {Show(V(newValues, "status"))}",
            _ => "",
        };
    }
}
