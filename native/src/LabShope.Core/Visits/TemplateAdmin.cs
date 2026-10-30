using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record TemplateInput(string Name, string? Category, string? TestId, string Header, string Footer, string ResultFormat,
    bool IncludeNormalRange, bool IncludeAbnormalFlag, bool IncludeNotes, string CustomCss, bool IsDefault);

/// <summary>Report templates of the lab (header, footer, layout), with the website's fields. Shared templates (no organization) can't be changed here.</summary>
public static class TemplateAdmin
{
    public static readonly string[] Formats = ["table", "list", "custom"];

    private static string? Blank(string? t) => string.IsNullOrWhiteSpace(t) ? null : t.Trim();

    private static (object? Row, string? Error) Row(string organizationId, TemplateInput t)
    {
        var name = t.Name?.Trim() ?? "";
        if (name.Length == 0) return (null, "Template name is required.");
        if (name.Length > 120) return (null, "The name is too long.");
        if (!Formats.Contains(t.ResultFormat)) return (null, "Choose how results are laid out.");
        return (new
        {
            organization_id = organizationId,
            name,
            test_category = Blank(t.Category),
            test_id = Blank(t.TestId),
            header_template = Blank(t.Header),
            footer_template = Blank(t.Footer),
            result_format = t.ResultFormat,
            include_normal_range = t.IncludeNormalRange,
            include_abnormal_flag = t.IncludeAbnormalFlag,
            include_notes = t.IncludeNotes,
            custom_css = Blank(t.CustomCss),
            is_default = t.IsDefault,
        }, null);
    }

    private static AdminResult Failed(ApiResult r) =>
        r.NetworkFailure ? new(false, "Changing a template needs an internet connection.")
        : r.Status is 401 or 403 ? new(false, "Your account isn't allowed to change report templates.")
        : new(false, r.ErrorMessage ?? "The template was not saved.");

    private static bool Empty(ApiResult r) => r.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0;

    public static async Task<AdminResult> AddAsync(SupabaseApi api, string organizationId, TemplateInput input, CancellationToken ct = default)
    {
        var (row, error) = Row(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.InsertAsync("test_templates", row, ct);
        return result.Ok ? new(true, null) : Failed(result);
    }

    public static async Task<AdminResult> UpdateAsync(SupabaseApi api, string organizationId, string templateId, TemplateInput input, CancellationToken ct = default)
    {
        var (row, error) = Row(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.PatchAsync("test_templates", $"id=eq.{templateId}&organization_id=eq.{organizationId}", row, ct);
        if (!result.Ok) return Failed(result);
        return Empty(result) ? new(false, "The server did not accept the change (template not found, or it is a shared template you can't change).") : new(true, null);
    }

    public static async Task<AdminResult> DeleteAsync(SupabaseApi api, string organizationId, string templateId, CancellationToken ct = default)
    {
        var result = await api.DeleteAsync("test_templates", $"id=eq.{templateId}&organization_id=eq.{organizationId}", ct);
        if (!result.Ok) return Failed(result);
        return Empty(result) ? new(false, "The server did not delete the template (not found, or it is a shared template you can't delete).") : new(true, null);
    }

    /// <summary>Reads the custom CSS (not kept on this PC) for the edit form.</summary>
    public static async Task<string> LoadCssAsync(SupabaseApi api, string organizationId, string templateId, CancellationToken ct = default)
    {
        var result = await api.SelectAsync("test_templates", $"select=custom_css&id=eq.{templateId}&organization_id=eq.{organizationId}&limit=1", ct);
        return result.Ok && result.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() > 0
            && rows[0].TryGetProperty("custom_css", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() ?? "" : "";
    }
}
