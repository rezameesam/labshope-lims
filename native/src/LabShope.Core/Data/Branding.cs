using System.Text.Json;

namespace LabShope.Core.Data;

/// <summary>How the lab presents itself on printed pages. Comes from the lab's settings on the website, cached on this PC.</summary>
public sealed record Branding(
    string Name,
    string? Tagline,
    IReadOnlyList<string> AddressLines,
    string? Phone,
    string? Email,
    string? Website,
    string ReportTagline,
    string ReportFooterNote,
    string? LogoUrl = null,
    string? LogoDataUri = null)
{
    public const string DefaultReportTagline = "Quality Healthcare Services";
    public const string DefaultFooterNote = "This is a computer-generated report.";

    public static Branding Minimal(string name) => new(name, null, [], null, null, null, DefaultReportTagline, DefaultFooterNote);

    /// <summary>Reads the answer of the website's public lab lookup (get_public_organization_context).</summary>
    public static Branding? FromContext(string json, string fallbackName)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; } catch (JsonException) { return null; }
        if (root.ValueKind != JsonValueKind.Object) return null;

        string? S(JsonElement? e, string name) =>
            e is { ValueKind: JsonValueKind.Object } o && o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && v.GetString()!.Trim() is { Length: > 0 } t ? t : null;

        JsonElement? org = root.TryGetProperty("organization", out var o1) ? o1 : null;
        JsonElement? lab = root.TryGetProperty("primary_lab", out var l1) ? l1 : null;
        JsonElement? settings = root.TryGetProperty("settings", out var s1) ? s1 : null;

        var lines = new[] { S(lab, "address"), string.Join(", ", new[] { S(lab, "city"), S(lab, "state") }.Where(x => x is not null)), S(lab, "pincode") }
            .Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x!).ToList();

        return new Branding(
            S(org, "display_name") ?? S(lab, "name") ?? fallbackName,
            S(settings, "branding_tagline"),
            lines,
            S(lab, "phone") ?? S(org, "primary_phone"),
            S(lab, "email") ?? S(org, "primary_email"),
            S(settings, "organization_website"),
            S(settings, "report_tagline") ?? DefaultReportTagline,
            S(settings, "report_footer_note") ?? DefaultFooterNote,
            LogoUrl: S(lab, "logo_url") ?? S(org, "logo_url"));
    }
}
