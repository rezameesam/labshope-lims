using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record LabProfileData(string DisplayName, string Phone, string Email, string Tagline, string Website, string ReportTagline, string ReportFooterNote, string? LogoUrl);

/// <summary>
/// The lab's public details as the website's settings page keeps them: name, phone and email on the organization, the tagline, website and report footer
/// in the organization settings, and the logo in the branding storage bucket.
/// </summary>
public static class LabProfile
{
    public const string BrandingBucket = "organization-branding";
    public const int MaxLogoBytes = 2 * 1024 * 1024;

    private static readonly Dictionary<string, string> LogoTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png", [".webp"] = "image/webp", [".svg"] = "image/svg+xml",
    };

    private static readonly (string Key, string Label, string Description)[] SettingKeys =
    [
        ("branding_tagline", "Brand Tagline", "Short public-facing tagline used across the site and report header."),
        ("organization_website", "Website URL", "Canonical public website URL for the organization. Leave blank to use the current app origin."),
        ("report_tagline", "Report Footer Tagline", "Short line shown at the bottom of generated reports next to the organization name."),
        ("report_footer_note", "Report Footer Note", "Footer note shown on generated PDF reports."),
    ];

    public static async Task<(LabProfileData? Profile, string? Error)> LoadAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var org = await api.SelectAsync("organizations", $"select=display_name,primary_phone,primary_email,logo_url&id=eq.{organizationId}&limit=1", ct);
        if (org.NetworkFailure) return (null, "The lab profile needs an internet connection.");
        if (!org.Ok) return (null, org.Status is 401 or 403 ? "Your account isn't allowed to see the lab profile." : org.ErrorMessage ?? "Could not load the lab profile.");
        if (org.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0) return (null, "The lab was not found on the server.");

        var settings = await api.SelectAsync("organization_settings", $"select=setting_key,setting_value&organization_id=eq.{organizationId}&setting_key=in.({string.Join(",", SettingKeys.Select(k => k.Key))})", ct);
        if (!settings.Ok && !settings.NetworkFailure) return (null, settings.ErrorMessage ?? "Could not load the lab settings.");

        static string? S(JsonElement e, string n) => e.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var values = new Dictionary<string, string>();
        if (settings.Body is { ValueKind: JsonValueKind.Array } s)
            foreach (var row in s.EnumerateArray()) if (S(row, "setting_key") is { } key) values[key] = S(row, "setting_value") ?? "";
        string V(string key) => values.TryGetValue(key, out var v) ? v : "";

        var o = rows[0];
        return (new LabProfileData(S(o, "display_name") ?? "", S(o, "primary_phone") ?? "", S(o, "primary_email") ?? "", V("branding_tagline"), V("organization_website"),
            V("report_tagline"), V("report_footer_note"), S(o, "logo_url")), null);
    }

    /// <summary>Saves what changed from <paramref name="before"/> (the organization row and the four settings), the way the website saves only changed settings.</summary>
    public static async Task<AdminResult> SaveAsync(SupabaseApi api, string organizationId, string? userId, LabProfileData before, LabProfileData after, CancellationToken ct = default)
    {
        var name = after.DisplayName?.Trim() ?? "";
        if (name.Length == 0) return new(false, "The lab name is required.");
        if (name.Length > 120) return new(false, "The lab name is too long.");
        var email = after.Email?.Trim() ?? "";
        if (email.Length > 0 && (!email.Contains('@') || email.Length < 5)) return new(false, "Enter a valid email address, or leave it empty.");
        var website = after.Website?.Trim() ?? "";
        if (website.Length > 0 && !Uri.TryCreate(website, UriKind.Absolute, out var uri)) return new(false, "Enter the website as a full address such as https://example.com, or leave it empty.");
        if (website.Length > 0 && Uri.TryCreate(website, UriKind.Absolute, out var parsed) && parsed.Scheme is not ("http" or "https")) return new(false, "The website must start with http:// or https://.");

        static string? Blank(string? t) => string.IsNullOrWhiteSpace(t) ? null : t.Trim();
        if (name != before.DisplayName || (after.Phone?.Trim() ?? "") != before.Phone || email != before.Email)
        {
            var saved = await api.PatchAsync("organizations", $"id=eq.{organizationId}", new { display_name = name, primary_phone = Blank(after.Phone), primary_email = Blank(email) }, ct);
            var failed = Failure(saved);
            if (failed is not null) return failed;
        }

        var values = new Dictionary<string, string>
        {
            ["branding_tagline"] = after.Tagline?.Trim() ?? "",
            ["organization_website"] = website,
            ["report_tagline"] = after.ReportTagline?.Trim() ?? "",
            ["report_footer_note"] = after.ReportFooterNote?.Trim() ?? "",
        };
        var old = new Dictionary<string, string>
        {
            ["branding_tagline"] = before.Tagline, ["organization_website"] = before.Website, ["report_tagline"] = before.ReportTagline, ["report_footer_note"] = before.ReportFooterNote,
        };
        var changed = SettingKeys.Where(k => values[k.Key] != (old[k.Key] ?? "")).Select(k => new
        {
            organization_id = organizationId, setting_key = k.Key, setting_value = values[k.Key], setting_type = "text", category = "general",
            label = k.Label, description = k.Description, is_encrypted = false, updated_by = userId,
        }).ToList();
        if (changed.Count > 0)
        {
            var saved = await api.UpsertAsync("organization_settings", changed, "organization_id,setting_key", ct);
            var failed = Failure(saved);
            if (failed is not null) return failed;
        }
        return new(true, null);
    }

    private static AdminResult? Failure(ApiResult r) =>
        r.NetworkFailure ? new(false, "Saving the lab profile needs an internet connection.")
        : r.Status is 401 or 403 ? new(false, "Your account isn't allowed to change the lab profile.")
        : !r.Ok ? new(false, r.ErrorMessage ?? "The lab profile was not saved.")
        : r.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0 ? new(false, "The server did not accept the change (your account isn't allowed to change the lab profile).")
        : null;

    /// <summary>Checks a logo file the way the website does (JPG, PNG, WebP or SVG, 2 MB at most). Returns the content type, or an error.</summary>
    public static (string? ContentType, string? Error) CheckLogo(string fileName, long size)
    {
        if (!LogoTypes.TryGetValue(Path.GetExtension(fileName), out var type)) return (null, "The logo must be a JPG, PNG, WebP or SVG file.");
        if (size > MaxLogoBytes) return (null, "The logo must be 2 MB or smaller.");
        if (size <= 0) return (null, "That file is empty.");
        return (type, null);
    }

    /// <summary>Uploads a new logo and points the lab at it. Returns the new public address.</summary>
    public static async Task<(string? Url, string? Error)> UploadLogoAsync(SupabaseApi api, string organizationId, string fileName, byte[] bytes, Func<DateTimeOffset>? now = null, CancellationToken ct = default)
    {
        var (type, error) = CheckLogo(fileName, bytes.LongLength);
        if (type is null) return (null, error);
        var path = $"{organizationId}/logo-{(now?.Invoke() ?? DateTimeOffset.UtcNow).ToUnixTimeMilliseconds()}{Path.GetExtension(fileName).ToLowerInvariant()}";

        var upload = await api.UploadObjectAsync(BrandingBucket, path, bytes, type, ct);
        var failed = Failure(upload);
        if (failed is not null) return (null, failed.Error);

        var url = api.PublicObjectUrl(BrandingBucket, path);
        var saved = await api.PatchAsync("organizations", $"id=eq.{organizationId}", new { logo_url = url }, ct);
        failed = Failure(saved);
        return failed is not null ? (null, failed.Error) : (url, null);
    }
}
