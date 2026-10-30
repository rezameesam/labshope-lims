using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record TeamResult(IReadOnlyList<TeamMember> Members, string? Error, bool Offline);

/// <summary>The lab's staff: the same employees list the website shows, adding people (the website's create-employee function) and switching them on or off.</summary>
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

    public sealed record NewStaff(string FullName, string Email, string Password, string Role, string Phone, string Designation, string Department, string? LabId);

    /// <summary>Creates a staff account exactly as the website does (server function create-employee; only an admin may).</summary>
    public static async Task<AdminResult> AddAsync(SupabaseApi api, string organizationId, NewStaff staff, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(staff.FullName)) return new(false, "Enter the person's name.");
        if (!staff.Email.Contains('@') || staff.Email.Trim().Length < 5) return new(false, "Enter a valid email address.");
        if (staff.Password.Length < 8) return new(false, "The password needs at least 8 characters.");
        if (staff.Role is not ("admin" or "employee" or "collector")) return new(false, "Choose a role.");

        static string? Opt(string s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        var result = await api.FunctionAsync("create-employee", new
        {
            email = staff.Email.Trim(), password = staff.Password, full_name = staff.FullName.Trim(), phone = Opt(staff.Phone),
            designation = Opt(staff.Designation), department = Opt(staff.Department), role = staff.Role, lab_id = staff.LabId, organization_id = organizationId,
        }, ct);
        return Outcome(result, "Adding staff needs an internet connection.", "Only an admin can add staff.", "The account could not be created.");
    }

    /// <summary>Switches a person on or off (they keep their history; an inactive person cannot sign in).</summary>
    public static async Task<AdminResult> SetActiveAsync(SupabaseApi api, string organizationId, string employeeId, bool active, CancellationToken ct = default)
    {
        var result = await api.PatchAsync("employees", $"id=eq.{employeeId}&organization_id=eq.{organizationId}", new { is_active = active }, ct);
        var outcome = Outcome(result, "This needs an internet connection.", "Your account isn't allowed to change staff.", "The change was not saved.");
        if (outcome.Ok && result.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0)
            return new(false, "The server did not accept the change (your account isn't allowed to change staff).");
        return outcome;
    }

    public sealed record StaffEdit(string FullName, string Phone, string Designation, string Department);

    /// <summary>Changes a person's name, phone, designation and department, as the website's edit form does (an admin may change all four).</summary>
    public static async Task<AdminResult> UpdateAsync(SupabaseApi api, string organizationId, string employeeId, StaffEdit edit, CancellationToken ct = default)
    {
        var name = edit.FullName?.Trim() ?? "";
        if (name.Length == 0) return new(false, "Enter the person's name.");
        if (name.Length > 120) return new(false, "The name is too long.");
        static string? Opt(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        var result = await api.PatchAsync("employees", $"id=eq.{employeeId}&organization_id=eq.{organizationId}",
            new { full_name = name, phone = Opt(edit.Phone), designation = Opt(edit.Designation), department = Opt(edit.Department) }, ct);
        var outcome = Outcome(result, "This needs an internet connection.", "Your account isn't allowed to change staff.", "The change was not saved.");
        if (outcome.Ok && result.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0)
            return new(false, "The server did not accept the change (your account isn't allowed to change staff).");
        return outcome;
    }

    public enum ResetMode { Email, Temporary, Custom }

    public sealed record ResetOutcome(bool Ok, string? Error, string? TempPassword = null);

    /// <summary>
    /// Resets a person's password with the website's server function: send them a reset link, give them a temporary password
    /// (shown once; they must change it), or set one you choose (at least 6 characters). Only an admin may, and only for an active person.
    /// </summary>
    public static async Task<ResetOutcome> ResetPasswordAsync(SupabaseApi api, string employeeId, ResetMode mode, string? customPassword, string resetBaseUrl, CancellationToken ct = default)
    {
        if (mode == ResetMode.Custom && (customPassword ?? "").Length < 6) return new(false, "The password needs at least 6 characters.");
        object body = mode switch
        {
            ResetMode.Temporary => new { employee_id = employeeId, reset_base_url = resetBaseUrl, mode = "temp" },
            ResetMode.Custom => new { employee_id = employeeId, reset_base_url = resetBaseUrl, mode = "set", custom_password = customPassword },
            _ => new { employee_id = employeeId, reset_base_url = resetBaseUrl, mode = "email" },
        };
        var result = await api.FunctionAsync("employee-admin-reset-password", body, ct);
        var outcome = Outcome(result, "Resetting a password needs an internet connection.", "Only an admin can reset a password.", "The password was not reset.");
        if (!outcome.Ok) return new(false, outcome.Error);
        string? temp = null;
        if (mode == ResetMode.Temporary)
        {
            temp = result.Body is { ValueKind: JsonValueKind.Object } o && o.TryGetProperty("temp_password", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            if (string.IsNullOrEmpty(temp)) return new(false, "The server did not return a temporary password.");
        }
        return new(true, null, temp);
    }

    private static AdminResult Outcome(ApiResult result, string offline, string denied, string failed)
    {
        if (result.NetworkFailure) return new(false, offline);
        if (result.Ok) return new(true, null);
        return new(false, result.Status is 401 or 403 ? denied : result.ErrorMessage ?? failed);
    }
}
