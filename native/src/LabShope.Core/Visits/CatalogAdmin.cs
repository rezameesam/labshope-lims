using System.Globalization;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record TestEdit(string Price, string Unit, string Min, string Max, string RangeText, bool Active);

public sealed record AdminResult(bool Ok, string? Error);

/// <summary>
/// Changes a test's price, unit and normal range on the server (the same fields the website's Test Catalog edits).
/// Catalog changes are made by managers, one at a time, and affect every computer, so they go straight to the server
/// and need the internet; the new values reach this PC with the next catalog refresh.
/// </summary>
public static class CatalogAdmin
{
    public static async Task<AdminResult> UpdateTestAsync(SupabaseApi api, string organizationId, string testId, TestEdit edit, CancellationToken ct = default)
    {
        static decimal? Num(string s, out bool bad)
        {
            bad = false;
            if (string.IsNullOrWhiteSpace(s)) return null;
            if (decimal.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return d;
            bad = true; return null;
        }

        var price = Num(edit.Price, out var badPrice);
        var min = Num(edit.Min, out var badMin);
        var max = Num(edit.Max, out var badMax);
        if (badPrice || (price is < 0)) return new(false, "Enter the price as a number (0 or more).");
        if (badMin || badMax) return new(false, "Enter the normal range limits as numbers.");
        if (min is not null && max is not null && min > max) return new(false, "The lowest normal value can't be higher than the highest.");

        var patch = new
        {
            price,
            unit = string.IsNullOrWhiteSpace(edit.Unit) ? null : edit.Unit.Trim(),
            normal_range_min = min,
            normal_range_max = max,
            normal_range_text = string.IsNullOrWhiteSpace(edit.RangeText) ? null : edit.RangeText.Trim(),
            is_active = edit.Active,
        };

        var result = await api.PatchAsync("tests", $"id=eq.{testId}&organization_id=eq.{organizationId}", patch, ct);
        if (result.NetworkFailure) return new(false, "Changing the catalog needs an internet connection.");
        if (!result.Ok) return new(false, result.Status is 401 or 403 ? "Your account isn't allowed to change the catalog." : result.ErrorMessage ?? "The change was not saved.");
        if (result.Body is { ValueKind: System.Text.Json.JsonValueKind.Array } rows && rows.GetArrayLength() == 0)
            return new(false, "The server did not accept the change (test not found, or your account isn't allowed to change the catalog).");
        return new(true, null);
    }
}
