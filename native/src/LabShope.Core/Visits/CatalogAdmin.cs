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
    /// <summary>The tests that are switched off (the catalog kept on this PC only holds active ones), read from the server so they can be switched back on.</summary>
    public static async Task<(IReadOnlyList<Data.CatalogTest> Tests, string? Error)> InactiveTestsAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var (rows, failure) = await api.SelectAllAsync("tests",
            $"select=id,test_id,name,price,category_id,unit,normal_range_text,normal_range_min,normal_range_max&organization_id=eq.{organizationId}&is_active=eq.false&order=name.asc,id.asc", ct: ct);
        if (failure is not null)
            return ([], failure.NetworkFailure ? "Switched-off tests need an internet connection." : failure.Status is 401 or 403 ? "Your account isn't allowed to see them." : failure.ErrorMessage ?? "Could not load the switched-off tests.");
        string? S(System.Text.Json.JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String ? v.GetString() : null;
        decimal? D(System.Text.Json.JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number ? v.GetDecimal() : null;
        return (rows.Select(r => new Data.CatalogTest(S(r, "id")!, S(r, "test_id"), S(r, "name") ?? "", D(r, "price") ?? 0m, S(r, "category_id"), S(r, "unit"), S(r, "normal_range_text"), D(r, "normal_range_min"), D(r, "normal_range_max"))).ToList(), null);
    }

    /// <summary>Switches several tests on or off in one go (the website's bulk option). Only this lab's tests are touched.</summary>
    public static async Task<(int Changed, string? Error)> SetTestsActiveAsync(SupabaseApi api, string organizationId, IReadOnlyList<string> testIds, bool active, CancellationToken ct = default)
    {
        var changed = 0;
        for (var i = 0; i < testIds.Count; i += 100)
        {
            var chunk = string.Join(",", testIds.Skip(i).Take(100));
            var result = await api.PatchAsync("tests", $"id=in.({chunk})&organization_id=eq.{organizationId}", new { is_active = active }, ct);
            if (result.NetworkFailure) return (changed, "Changing the catalog needs an internet connection.");
            if (!result.Ok) return (changed, result.Status is 401 or 403 ? "Your account isn't allowed to change the catalog." : result.ErrorMessage ?? "The change was not saved.");
            if (result.Body is { ValueKind: System.Text.Json.JsonValueKind.Array } rows) changed += rows.GetArrayLength();
        }
        return (changed, changed == 0 && testIds.Count > 0 ? "The server did not accept the change (your account may not be allowed to change the catalog)." : null);
    }

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

    public sealed record NewTest(string Name, string Price, string? CategoryId, string SampleType, string Unit, string Min, string Max, string RangeText);

    /// <summary>The website's rule for a new test's code: initials of the words (or the first letters), then a running number such as CBC001.</summary>
    public static string NextTestCode(string name, IEnumerable<string?> existingCodes)
    {
        var words = name.ToUpperInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        static string Clean(string s) => new(s.Where(c => c is (>= 'A' and <= 'Z') or (>= '0' and <= '9')).ToArray());
        var prefix = words.Length >= 2 ? Clean(string.Concat(words.Take(4).Select(w => w[0].ToString()))) : Clean(name.Trim().ToUpperInvariant().Replace(" ", "")[..Math.Min(4, name.Trim().Replace(" ", "").Length)]);
        if (prefix.Length < 2) prefix = Clean(name.ToUpperInvariant().Replace(" ", "")[..Math.Min(3, name.Replace(" ", "").Length)]);
        if (prefix.Length == 0) prefix = "TEST";
        prefix = prefix[..Math.Min(4, prefix.Length)];

        var used = existingCodes.Where(c => c is not null).Select(c => c!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var highest = used.Where(c => c.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            .Select(c => int.TryParse(c[prefix.Length..], out var n) ? n : 0).DefaultIfEmpty(0).Max();
        return $"{prefix}{highest + 1:000}";
    }

    /// <summary>Adds a test to the catalog (the same row the website's Test Catalog inserts).</summary>
    public static async Task<AdminResult> AddTestAsync(SupabaseApi api, string organizationId, NewTest test, IEnumerable<string?> existingCodes, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(test.Name)) return new(false, "Enter the test name.");
        static decimal? Num(string s, out bool bad)
        {
            bad = false;
            if (string.IsNullOrWhiteSpace(s)) return null;
            if (decimal.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return d;
            bad = true; return null;
        }
        var price = Num(test.Price, out var badPrice);
        var min = Num(test.Min, out var badMin);
        var max = Num(test.Max, out var badMax);
        if (badPrice || price is < 0) return new(false, "Enter the price as a number (0 or more).");
        if (badMin || badMax) return new(false, "Enter the normal range limits as numbers.");
        if (min is not null && max is not null && min > max) return new(false, "The lowest normal value can't be higher than the highest.");

        var result = await api.InsertAsync("tests", new
        {
            name = test.Name.Trim(), price, category_id = test.CategoryId, organization_id = organizationId,
            test_id = NextTestCode(test.Name, existingCodes), sample_type = string.IsNullOrWhiteSpace(test.SampleType) ? "Blood" : test.SampleType.Trim(),
            unit = string.IsNullOrWhiteSpace(test.Unit) ? null : test.Unit.Trim(), normal_range_min = min, normal_range_max = max,
            normal_range_text = string.IsNullOrWhiteSpace(test.RangeText) ? null : test.RangeText.Trim(), is_active = true,
        }, ct);
        if (result.NetworkFailure) return new(false, "Changing the catalog needs an internet connection.");
        if (!result.Ok) return new(false, result.Status is 401 or 403 ? "Your account isn't allowed to change the catalog." : result.Status == 409 ? "A test with that code or name already exists." : result.ErrorMessage ?? "The test was not added.");
        return new(true, null);
    }
}
