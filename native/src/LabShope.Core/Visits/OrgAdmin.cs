using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record LabInput(string Code, string Name, string Type, string? ParentLabId, string Address, string City, string State, string Pincode,
    string Phone, string Email, bool Active, string Latitude, string Longitude, bool AbdmEnabled, string AbdmFacilityId);

/// <summary>A lab read from the server for editing; <see cref="Settings"/> is kept so settings this app doesn't show are not lost.</summary>
public sealed record LabFull(string Id, LabInput Input, JsonObject Settings);

public sealed record CenterInput(string LabId, string Code, string Name, string Address, string ContactPerson, string Phone, string Email, bool Active);

/// <summary>Labs and collection centres managed from the desktop, with the website's fields and rules (codes in capitals, map position ranges).</summary>
public static class OrgAdmin
{
    public static readonly string[] LabTypes = ["main", "branch", "collection_center"];

    private static string? Blank(string? t) => string.IsNullOrWhiteSpace(t) ? null : t.Trim();
    private static bool Empty(ApiResult r) => r.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0;

    private static AdminResult Failed(ApiResult r, string what, string clash) =>
        r.NetworkFailure ? new(false, "This needs an internet connection.")
        : r.Status is 401 or 403 ? new(false, "Your account isn't allowed to change this.")
        : r.Status == 409 || r.ErrorCode == "23505" ? new(false, clash)
        : new(false, r.ErrorMessage ?? $"{what} was not saved.");

    private static bool Coordinate(string text, double limit, out double? value)
    {
        value = null;
        if (string.IsNullOrWhiteSpace(text)) return true;
        if (!double.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v) || double.IsNaN(v) || Math.Abs(v) > limit) return false;
        value = v;
        return true;
    }

    private static (JsonObject? Row, string? Error) LabRow(string organizationId, LabInput l, JsonObject? settings)
    {
        var code = l.Code?.Trim().ToUpperInvariant() ?? "";
        var name = l.Name?.Trim() ?? "";
        if (code.Length == 0 || name.Length == 0) return (null, "Lab code and name are required.");
        if (!LabTypes.Contains(l.Type)) return (null, "Choose the type of lab.");
        if (!Coordinate(l.Latitude, 90, out var lat)) return (null, "Latitude must be between -90 and 90.");
        if (!Coordinate(l.Longitude, 180, out var lon)) return (null, "Longitude must be between -180 and 180.");
        var merged = settings is null ? new JsonObject() : JsonNode.Parse(settings.ToJsonString())!.AsObject();
        merged["abdm_enabled"] = l.AbdmEnabled;
        merged["abdm_facility_id"] = Blank(l.AbdmFacilityId);
        merged["map_latitude"] = lat;
        merged["map_longitude"] = lon;
        return (new JsonObject
        {
            ["lab_code"] = code,
            ["organization_id"] = organizationId,
            ["name"] = name,
            ["type"] = l.Type,
            ["parent_lab_id"] = Blank(l.ParentLabId),
            ["address"] = Blank(l.Address),
            ["city"] = Blank(l.City),
            ["state"] = Blank(l.State),
            ["pincode"] = Blank(l.Pincode),
            ["phone"] = Blank(l.Phone),
            ["email"] = Blank(l.Email),
            ["settings"] = merged,
            ["is_active"] = l.Active,
        }, null);
    }

    public static async Task<AdminResult> AddLabAsync(SupabaseApi api, string organizationId, LabInput input, CancellationToken ct = default)
    {
        var (row, error) = LabRow(organizationId, input, null);
        if (row is null) return new(false, error);
        var result = await api.InsertAsync("labs", row, ct);
        return result.Ok ? new(true, null) : Failed(result, "The lab", "That lab code is already used.");
    }

    public static async Task<AdminResult> UpdateLabAsync(SupabaseApi api, string organizationId, LabFull lab, LabInput input, CancellationToken ct = default)
    {
        var (row, error) = LabRow(organizationId, input, lab.Settings);
        if (row is null) return new(false, error);
        if (input.ParentLabId == lab.Id) return new(false, "A lab can't be its own parent.");
        var result = await api.PatchAsync("labs", $"id=eq.{lab.Id}&organization_id=eq.{organizationId}", row, ct);
        if (!result.Ok) return Failed(result, "The lab", "That lab code is already used.");
        return Empty(result) ? new(false, "The server did not accept the change (lab not found, or your account isn't allowed to change it).") : new(true, null);
    }

    public static async Task<AdminResult> DeleteLabAsync(SupabaseApi api, string organizationId, string labId, CancellationToken ct = default)
    {
        var result = await api.DeleteAsync("labs", $"id=eq.{labId}&organization_id=eq.{organizationId}", ct);
        if (result.Ok) return Empty(result) ? new(false, "The server did not delete the lab (not found, or your account isn't allowed to).") : new(true, null);
        if (result.Status == 409 || result.ErrorCode == "23503")
            return new(false, "This lab has patients, bills or staff on record, so it can't be deleted. Edit it and untick Active instead.");
        return Failed(result, "The lab", "");
    }

    public static async Task<(LabFull? Lab, string? Error)> LoadLabAsync(SupabaseApi api, string organizationId, string labId, CancellationToken ct = default)
    {
        var result = await api.SelectAsync("labs", $"select=id,lab_code,name,type,parent_lab_id,address,city,state,pincode,phone,email,settings,is_active&id=eq.{labId}&organization_id=eq.{organizationId}&limit=1", ct);
        if (result.NetworkFailure) return (null, "Editing a lab needs an internet connection.");
        if (!result.Ok) return (null, result.ErrorMessage ?? "Could not load the lab.");
        if (result.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0) return (null, "That lab was not found on the server.");
        var r = rows[0];
        string Text(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        var settings = r.TryGetProperty("settings", out var s) && s.ValueKind == JsonValueKind.Object ? JsonNode.Parse(s.GetRawText())!.AsObject() : new JsonObject();
        string Setting(string key) => settings[key] is JsonValue v && v.TryGetValue<double>(out var d) ? d.ToString("0.######", CultureInfo.InvariantCulture) : "";
        var type = Text("type"); if (!LabTypes.Contains(type)) type = "main";
        var input = new LabInput(Text("lab_code"), Text("name"), type, Text("parent_lab_id") is { Length: > 0 } p ? p : null, Text("address"), Text("city"), Text("state"),
            Text("pincode"), Text("phone"), Text("email"), !r.TryGetProperty("is_active", out var a) || a.ValueKind != JsonValueKind.False,
            Setting("map_latitude"), Setting("map_longitude"), settings["abdm_enabled"] is JsonValue ab && ab.TryGetValue<bool>(out var en) && en,
            settings["abdm_facility_id"] is JsonValue f && f.TryGetValue<string>(out var fid) ? fid : "");
        return (new LabFull(labId, input, settings), null);
    }

    // ── collection centres ───────────────────────────────────────────────

    private static (object? Row, string? Error) CenterRow(string organizationId, CenterInput c)
    {
        var code = c.Code?.Trim().ToUpperInvariant() ?? "";
        var name = c.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(c.LabId) || code.Length == 0 || name.Length == 0) return (null, "Lab, code and name are required.");
        return (new
        {
            lab_id = c.LabId,
            organization_id = organizationId,
            code,
            name,
            address = Blank(c.Address),
            contact_person = Blank(c.ContactPerson),
            phone = Blank(c.Phone),
            email = Blank(c.Email),
            is_active = c.Active,
        }, null);
    }

    private const string CenterClash = "That centre code is already used for this lab.";

    public static async Task<AdminResult> AddCenterAsync(SupabaseApi api, string organizationId, CenterInput input, CancellationToken ct = default)
    {
        var (row, error) = CenterRow(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.InsertAsync("collection_centers", row, ct);
        return result.Ok ? new(true, null) : Failed(result, "The centre", CenterClash);
    }

    public static async Task<AdminResult> UpdateCenterAsync(SupabaseApi api, string organizationId, string centerId, CenterInput input, CancellationToken ct = default)
    {
        var (row, error) = CenterRow(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.PatchAsync("collection_centers", $"id=eq.{centerId}&organization_id=eq.{organizationId}", row, ct);
        if (!result.Ok) return Failed(result, "The centre", CenterClash);
        return Empty(result) ? new(false, "The server did not accept the change (centre not found, or your account isn't allowed to change it).") : new(true, null);
    }

    public static async Task<AdminResult> DeleteCenterAsync(SupabaseApi api, string organizationId, string centerId, CancellationToken ct = default)
    {
        var result = await api.DeleteAsync("collection_centers", $"id=eq.{centerId}&organization_id=eq.{organizationId}", ct);
        if (result.Ok) return Empty(result) ? new(false, "The server did not delete the centre (not found, or your account isn't allowed to).") : new(true, null);
        if (result.Status == 409 || result.ErrorCode == "23503")
            return new(false, "This centre has patients or bills on record, so it can't be deleted. Edit it and untick Active instead.");
        return Failed(result, "The centre", "");
    }

    public static async Task<(CenterInput? Center, string? Error)> LoadCenterAsync(SupabaseApi api, string organizationId, string centerId, CancellationToken ct = default)
    {
        var result = await api.SelectAsync("collection_centers", $"select=lab_id,code,name,address,contact_person,phone,email,is_active&id=eq.{centerId}&organization_id=eq.{organizationId}&limit=1", ct);
        if (result.NetworkFailure) return (null, "Editing a centre needs an internet connection.");
        if (!result.Ok) return (null, result.ErrorMessage ?? "Could not load the centre.");
        if (result.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0) return (null, "That centre was not found on the server.");
        var r = rows[0];
        string Text(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        return (new CenterInput(Text("lab_id"), Text("code"), Text("name"), Text("address"), Text("contact_person"), Text("phone"), Text("email"),
            !r.TryGetProperty("is_active", out var a) || a.ValueKind != JsonValueKind.False), null);
    }
}
