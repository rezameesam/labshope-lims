using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record TeamResult(IReadOnlyList<TeamMember> Members, string? Error, bool Offline);

/// <summary>Reads the lab's staff (the same employees list the website shows). Read-only: accounts and access are managed on the website.</summary>
public static class TeamService
{
    public static async Task<TeamResult> LoadAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var (rows, failure) = await api.SelectAllAsync("employees",
            $"select=id,employee_id,full_name,email,phone,designation,department,lab_id,is_active&organization_id=eq.{organizationId}&order=full_name.asc", ct: ct);
        if (failure is not null)
            return failure.NetworkFailure
                ? new TeamResult([], "The team list needs an internet connection.", true)
                : new TeamResult([], failure.Status is 401 or 403 ? "Your account isn't allowed to see the team." : failure.ErrorMessage ?? "Could not load the team.", false);

        static string? S(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var members = rows.Select(r => new TeamMember(
            S(r, "id")!, S(r, "employee_id") ?? "", S(r, "full_name") ?? "", S(r, "email"), S(r, "phone"), S(r, "designation"), S(r, "department"), S(r, "lab_id"),
            !(r.TryGetProperty("is_active", out var a) && a.ValueKind == JsonValueKind.False))).ToList();
        return new TeamResult(members, null, false);
    }
}
