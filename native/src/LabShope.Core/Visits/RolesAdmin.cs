using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record RoleRow(string Id, string Name, string? Description, bool IsActive, bool IsSystem, int Permissions, int Users)
{
    public string StateText => IsSystem ? "System" : IsActive ? "Active" : "Switched off";
}
public sealed record RoleResult(bool Ok, string? Error = null);

/// <summary>
/// The website's Roles &amp; Permissions: custom roles for the lab and what each may do. Done online against the server (admins only by its row rules).
/// </summary>
public static class RolesAdmin
{
    /// <summary>The permissions the website offers, in its groups and order.</summary>
    public static readonly IReadOnlyList<(string Group, string[] Permissions)> Groups =
    [
        ("Patient Management", ["view_patients", "create_patients", "edit_patients", "delete_patients"]),
        ("Test Management", ["view_tests", "create_tests", "edit_tests", "delete_tests", "enter_test_results", "view_test_results"]),
        ("Billing & Finance", ["view_billing", "create_invoices", "edit_invoices", "delete_invoices", "process_payments", "view_financial_reports"]),
        ("Inventory", ["view_inventory", "manage_inventory", "view_inventory_alerts"]),
        ("Employee Management", ["view_employees", "create_employees", "edit_employees", "delete_employees", "manage_roles"]),
        ("Test Catalog", ["view_test_catalog", "manage_test_catalog"]),
        ("Test Packages", ["view_test_packages", "manage_test_packages"]),
        ("Doctors", ["view_doctors", "manage_doctors"]),
        ("Reminders", ["view_reminders", "manage_reminders"]),
        ("Reports & Analytics", ["view_reports", "export_reports"]),
        ("Labs & Centers", ["view_labs", "manage_labs", "view_collection_centers", "manage_collection_centers"]),
        ("System", ["manage_settings", "view_audit_logs"]),
    ];

    public static string Label(string permission) =>
        string.Join(' ', permission.Split('_').Select(w => char.ToUpperInvariant(w[0]) + w[1..]));

    public static async Task<(IReadOnlyList<RoleRow> Roles, string? Error)> LoadAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var roles = await api.SelectAsync("custom_roles", $"select=id,name,description,is_active,is_system_role&organization_id=eq.{organizationId}&order=created_at.desc", ct);
        if (!roles.Ok) return ([], Describe(roles, "Could not load the roles."));
        var list = Rows(roles).ToList();
        if (list.Count == 0) return ([], null);

        var ids = string.Join(",", list.Select(r => S(r, "id")));
        var perms = await api.SelectAsync("role_permissions", $"select=role_id&role_id=in.({ids})", ct);
        if (!perms.Ok) return ([], Describe(perms, "Could not load the roles."));
        var users = await api.SelectAsync("user_custom_roles", $"select=role_id&role_id=in.({ids})", ct);
        if (!users.Ok) return ([], Describe(users, "Could not load the roles."));
        var permCount = Rows(perms).GroupBy(r => S(r, "role_id")).ToDictionary(g => g.Key!, g => g.Count());
        var userCount = Rows(users).GroupBy(r => S(r, "role_id")).ToDictionary(g => g.Key!, g => g.Count());

        return (list.Select(r => new RoleRow(S(r, "id")!, S(r, "name") ?? "", S(r, "description"), Flag(r, "is_active"), Flag(r, "is_system_role"),
            permCount.GetValueOrDefault(S(r, "id")!), userCount.GetValueOrDefault(S(r, "id")!))).ToList(), null);
    }

    public static async Task<(ISet<string> Permissions, string? Error)> PermissionsOfAsync(SupabaseApi api, string roleId, CancellationToken ct = default)
    {
        var res = await api.SelectAsync("role_permissions", $"select=permission&role_id=eq.{roleId}", ct);
        return res.Ok ? (Rows(res).Select(r => S(r, "permission")!).ToHashSet(), null) : (new HashSet<string>(), Describe(res, "Could not load the role's permissions."));
    }

    /// <summary>Creates a role, or changes <paramref name="id"/> (adding and removing only the permissions that differ, like the website).</summary>
    public static async Task<RoleResult> SaveAsync(SupabaseApi api, string organizationId, string? id, string name, string? description, bool active, ISet<string> permissions, Func<Guid>? newId = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name)) return new(false, "Give the role a name.");
        var known = Groups.SelectMany(g => g.Permissions).ToHashSet();
        var wanted = permissions.Where(known.Contains).ToHashSet();
        var desc = string.IsNullOrWhiteSpace(description) ? null : description.Trim();

        if (id is null)
        {
            id = (newId ?? Guid.NewGuid).Invoke().ToString();
            var created = await api.InsertAsync("custom_roles", new { id, name = name.Trim(), description = desc, is_active = active, organization_id = organizationId }, ct);
            if (!created.Ok) return new(false, Describe(created, "Could not create the role."));
            if (wanted.Count > 0)
            {
                var add = await api.InsertAsync("role_permissions", wanted.Select(p => new { role_id = id, permission = p }).ToList(), ct);
                if (!add.Ok) return new(false, Describe(add, "The role was created but its permissions were not saved."));
            }
            return new(true);
        }

        var upd = await api.PatchAsync("custom_roles", $"id=eq.{id}&organization_id=eq.{organizationId}", new { name = name.Trim(), description = desc, is_active = active }, ct);
        if (!upd.Ok) return new(false, Describe(upd, "Could not save the role."));
        if (upd.Body is { ValueKind: JsonValueKind.Array } a && a.GetArrayLength() == 0) return new(false, "That role is gone or you aren't allowed to change it.");

        var (existing, error) = await PermissionsOfAsync(api, id, ct);
        if (error is not null) return new(false, error);
        var remove = existing.Where(p => !wanted.Contains(p)).ToList();
        if (remove.Count > 0)
        {
            var del = await api.DeleteAsync("role_permissions", $"role_id=eq.{id}&permission=in.({string.Join(",", remove)})", ct);
            if (!del.Ok) return new(false, Describe(del, "The permissions were not saved."));
        }
        var added = wanted.Where(p => !existing.Contains(p)).ToList();
        if (added.Count > 0)
        {
            var add = await api.InsertAsync("role_permissions", added.Select(p => new { role_id = id, permission = p }).ToList(), ct);
            if (!add.Ok) return new(false, Describe(add, "The permissions were not saved."));
        }
        return new(true);
    }

    public static async Task<RoleResult> DeleteAsync(SupabaseApi api, string organizationId, RoleRow role, CancellationToken ct = default)
    {
        if (role.IsSystem) return new(false, "System roles cannot be deleted.");
        var res = await api.DeleteAsync("custom_roles", $"id=eq.{role.Id}&organization_id=eq.{organizationId}", ct);
        if (!res.Ok) return new(false, Describe(res, "Could not delete the role."));
        return res.Body is { ValueKind: JsonValueKind.Array } a && a.GetArrayLength() == 0 ? new(false, "That role is gone or you aren't allowed to delete it.") : new(true);
    }

    private static IEnumerable<JsonElement> Rows(ApiResult r) => r.Body is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray() : [];
    private static string? S(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    private static bool Flag(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.True;
    private static string Describe(ApiResult r, string fallback) =>
        r.NetworkFailure ? "Roles need an internet connection." : r.Status is 401 or 403 ? "Only administrators can manage roles." : r.ErrorMessage ?? fallback;
}
