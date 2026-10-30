using System.Globalization;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record DoctorInput(string Name, string Specialization, string Phone, string Email, string Address, string Commission, bool Active, string Notes);

/// <summary>Everything the website's doctor form holds (this PC keeps only name, specialisation and commission).</summary>
public sealed record DoctorFull(string Id, DoctorInput Input);

public sealed record ExternalLabInput(string Name, string Code, string ContactPerson, string Phone, string Email, string Address, string GstNumber, string Notes);

public sealed record PackageInput(string Name, string Description, string DiscountPercent, IReadOnlyList<string> TestIds, bool Active);

/// <summary>
/// Doctors and test packages managed from the desktop, with the website's rules: the same fields, a package's price is
/// the chosen tests' prices less its discount percentage, and a package keeps its tests in test_package_tests.
/// </summary>
public static class CatalogManage
{
    private static AdminResult Failed(ApiResult r, string what) =>
        r.NetworkFailure ? new(false, "Changing the catalog needs an internet connection.")
        : r.Status is 401 or 403 ? new(false, "Your account isn't allowed to change the catalog.")
        : new(false, r.ErrorMessage ?? $"{what} was not saved.");

    private static bool Empty(ApiResult r) => r.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0;

    private static string? Blank(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    // ── doctors ──────────────────────────────────────────────────────────

    private static (object? Row, string? Error) DoctorRow(string organizationId, DoctorInput d)
    {
        var name = d.Name?.Trim() ?? "";
        if (name.Length == 0) return (null, "Doctor name is required.");
        if (name.Length > 120) return (null, "The doctor's name is too long.");
        decimal commission = 0;
        if (!string.IsNullOrWhiteSpace(d.Commission) && (!decimal.TryParse(d.Commission.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out commission) || commission is < 0 or > 100))
            return (null, "Enter the commission as a percentage from 0 to 100.");
        return (new
        {
            name,
            organization_id = organizationId,
            specialization = Blank(d.Specialization),
            phone = Blank(d.Phone),
            email = Blank(d.Email),
            address = Blank(d.Address),
            commission_percentage = commission,
            is_active = d.Active,
            notes = Blank(d.Notes),
        }, null);
    }

    public static async Task<AdminResult> AddDoctorAsync(SupabaseApi api, string organizationId, DoctorInput input, CancellationToken ct = default)
    {
        var (row, error) = DoctorRow(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.InsertAsync("doctors", row, ct);
        return result.Ok ? new(true, null) : Failed(result, "The doctor");
    }

    public static async Task<AdminResult> UpdateDoctorAsync(SupabaseApi api, string organizationId, string doctorId, DoctorInput input, CancellationToken ct = default)
    {
        var (row, error) = DoctorRow(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.PatchAsync("doctors", $"id=eq.{doctorId}&organization_id=eq.{organizationId}", row, ct);
        if (!result.Ok) return Failed(result, "The doctor");
        return Empty(result) ? new(false, "The server did not accept the change (doctor not found, or your account isn't allowed to change the catalog).") : new(true, null);
    }

    /// <summary>Deletes a doctor as the website does. A doctor who already has referrals cannot be deleted: say to switch them off instead.</summary>
    public static async Task<AdminResult> DeleteDoctorAsync(SupabaseApi api, string organizationId, string doctorId, CancellationToken ct = default)
    {
        var result = await api.DeleteAsync("doctors", $"id=eq.{doctorId}&organization_id=eq.{organizationId}", ct);
        if (result.Ok) return Empty(result) ? new(false, "The server did not delete the doctor (not found, or your account isn't allowed to).") : new(true, null);
        if (result.Status == 409 || result.ErrorCode == "23503")
            return new(false, "This doctor has referrals on record, so they can't be deleted. Edit them and untick Active instead.");
        return Failed(result, "The doctor");
    }

    /// <summary>Reads the whole doctor row (phone, email, address, notes) for the edit form.</summary>
    public static async Task<(DoctorFull? Doctor, string? Error)> LoadDoctorAsync(SupabaseApi api, string organizationId, string doctorId, CancellationToken ct = default)
    {
        var result = await api.SelectAsync("doctors", $"select=id,name,specialization,phone,email,address,commission_percentage,is_active,notes&id=eq.{doctorId}&organization_id=eq.{organizationId}&limit=1", ct);
        if (result.NetworkFailure) return (null, "Editing a doctor needs an internet connection.");
        if (!result.Ok) return (null, result.Status is 401 or 403 ? "Your account isn't allowed to see doctors." : result.ErrorMessage ?? "Could not load the doctor.");
        if (result.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0) return (null, "That doctor was not found on the server.");
        var r = rows[0];
        string Text(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        var commission = r.TryGetProperty("commission_percentage", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetDecimal() : 0m;
        var active = !r.TryGetProperty("is_active", out var a) || a.ValueKind != JsonValueKind.False;
        return (new DoctorFull(doctorId, new DoctorInput(Text("name"), Text("specialization"), Text("phone"), Text("email"), Text("address"),
            commission.ToString("0.##", CultureInfo.InvariantCulture), active, Text("notes"))), null);
    }

    // ── packages ─────────────────────────────────────────────────────────

    /// <summary>The package price: the chosen tests' prices less the discount percentage, to the paisa.</summary>
    public static decimal PackagePrice(IEnumerable<decimal> testPrices, decimal discountPercent) =>
        PatientRules.Paise(testPrices.Sum() * (100m - discountPercent) / 100m);

    private static (object? Row, decimal Price, string? Error) PackageRow(string organizationId, string? id, PackageInput p, Catalog catalog)
    {
        var name = p.Name?.Trim() ?? "";
        if (name.Length == 0) return (null, 0, "Package name is required.");
        if (p.TestIds.Count == 0) return (null, 0, "Pick at least one test.");
        decimal discount = 0;
        if (!string.IsNullOrWhiteSpace(p.DiscountPercent) && (!decimal.TryParse(p.DiscountPercent.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out discount) || discount is < 0 or > 100))
            return (null, 0, "Enter the discount as a percentage from 0 to 100.");
        var prices = new List<decimal>();
        foreach (var testId in p.TestIds.Distinct())
        {
            var test = catalog.Tests.FirstOrDefault(t => t.Id == testId);
            if (test is null) return (null, 0, "One of the chosen tests is no longer in the catalog. Sync, then try again.");
            prices.Add(test.Price);
        }
        var price = PackagePrice(prices, discount);
        var row = new Dictionary<string, object?>
        {
            ["name"] = name,
            ["description"] = Blank(p.Description),
            ["price"] = price,
            ["discount_percentage"] = discount,
            ["is_active"] = p.Active,
            ["organization_id"] = organizationId,
        };
        if (id is not null) row["id"] = id;
        return (row, price, null);
    }

    private static IEnumerable<object> Links(string packageId, IEnumerable<string> testIds) =>
        testIds.Distinct().Select(t => new { package_id = packageId, test_id = t });

    public static async Task<AdminResult> AddPackageAsync(SupabaseApi api, string organizationId, PackageInput input, Catalog catalog, CancellationToken ct = default)
    {
        var id = Guid.NewGuid().ToString();
        var (row, _, error) = PackageRow(organizationId, id, input, catalog);
        if (row is null) return new(false, error);
        var made = await api.InsertAsync("test_packages", row, ct);
        if (!made.Ok) return Failed(made, "The package");
        var links = await api.InsertAsync("test_package_tests", Links(id, input.TestIds), ct);
        if (links.Ok) return new(true, null);
        // Don't leave an empty package behind.
        await api.DeleteAsync("test_packages", $"id=eq.{id}&organization_id=eq.{organizationId}", ct);
        return Failed(links, "The package's tests");
    }

    public static async Task<AdminResult> UpdatePackageAsync(SupabaseApi api, string organizationId, string packageId, PackageInput input, Catalog catalog, CancellationToken ct = default)
    {
        var (row, _, error) = PackageRow(organizationId, null, input, catalog);
        if (row is null) return new(false, error);
        var changed = await api.PatchAsync("test_packages", $"id=eq.{packageId}&organization_id=eq.{organizationId}", row, ct);
        if (!changed.Ok) return Failed(changed, "The package");
        if (Empty(changed)) return new(false, "The server did not accept the change (package not found, or your account isn't allowed to change the catalog).");
        var cleared = await api.DeleteAsync("test_package_tests", $"package_id=eq.{packageId}", ct);
        if (!cleared.Ok) return Failed(cleared, "The package's tests");
        var links = await api.InsertAsync("test_package_tests", Links(packageId, input.TestIds), ct);
        return links.Ok ? new(true, null) : Failed(links, "The package's tests");
    }

    public static async Task<AdminResult> DeletePackageAsync(SupabaseApi api, string organizationId, string packageId, CancellationToken ct = default)
    {
        var cleared = await api.DeleteAsync("test_package_tests", $"package_id=eq.{packageId}", ct);
        if (!cleared.Ok) return Failed(cleared, "The package");
        var result = await api.DeleteAsync("test_packages", $"id=eq.{packageId}&organization_id=eq.{organizationId}", ct);
        if (!result.Ok) return Failed(result, "The package");
        return Empty(result) ? new(false, "The server did not delete the package (not found, or your account isn't allowed to).") : new(true, null);
    }

    /// <summary>Reads a package's description, discount and on/off state for the edit form (this PC keeps only name, price and tests).</summary>
    public static async Task<(PackageInput? Package, string? Error)> LoadPackageAsync(SupabaseApi api, string organizationId, TestPackage package, CancellationToken ct = default)
    {
        var result = await api.SelectAsync("test_packages", $"select=name,description,discount_percentage,is_active&id=eq.{package.Id}&organization_id=eq.{organizationId}&limit=1", ct);
        if (result.NetworkFailure) return (null, "Editing a package needs an internet connection.");
        if (!result.Ok) return (null, result.ErrorMessage ?? "Could not load the package.");
        if (result.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0) return (null, "That package was not found on the server.");
        var r = rows[0];
        string Text(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        var discount = r.TryGetProperty("discount_percentage", out var d) && d.ValueKind == JsonValueKind.Number ? d.GetDecimal() : 0m;
        var active = !r.TryGetProperty("is_active", out var a) || a.ValueKind != JsonValueKind.False;
        return (new PackageInput(Text("name"), Text("description"), discount.ToString("0.##", CultureInfo.InvariantCulture), package.TestIds, active), null);
    }

    // ── external labs and categories ─────────────────────────────────────

    private static (object? Row, string? Error) ExternalLabRow(string organizationId, ExternalLabInput l)
    {
        var name = l.Name?.Trim() ?? "";
        if (name.Length == 0) return (null, "Name is required.");
        if (name.Length > 120) return (null, "The name is too long.");
        return (new
        {
            organization_id = organizationId,
            name,
            code = Blank(l.Code),
            contact_person = Blank(l.ContactPerson),
            phone = Blank(l.Phone),
            email = Blank(l.Email),
            address = Blank(l.Address),
            gst_number = Blank(l.GstNumber),
            notes = Blank(l.Notes),
        }, null);
    }

    public static async Task<AdminResult> AddExternalLabAsync(SupabaseApi api, string organizationId, ExternalLabInput input, CancellationToken ct = default)
    {
        var (row, error) = ExternalLabRow(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.InsertAsync("external_labs", row, ct);
        return result.Ok ? new(true, null) : Failed(result, "The external lab");
    }

    public static async Task<AdminResult> UpdateExternalLabAsync(SupabaseApi api, string organizationId, string labId, ExternalLabInput input, CancellationToken ct = default)
    {
        var (row, error) = ExternalLabRow(organizationId, input);
        if (row is null) return new(false, error);
        var result = await api.PatchAsync("external_labs", $"id=eq.{labId}&organization_id=eq.{organizationId}", row, ct);
        if (!result.Ok) return Failed(result, "The external lab");
        return Empty(result) ? new(false, "The server did not accept the change (lab not found, or your account isn't allowed to change the catalog).") : new(true, null);
    }

    /// <summary>Switches an external lab off (it is no longer offered when sending a test out) or on again, as the website's toggle does.</summary>
    public static async Task<AdminResult> SetExternalLabActiveAsync(SupabaseApi api, string organizationId, string labId, bool active, CancellationToken ct = default)
    {
        var result = await api.PatchAsync("external_labs", $"id=eq.{labId}&organization_id=eq.{organizationId}", new { is_active = active }, ct);
        if (!result.Ok) return Failed(result, "The external lab");
        return Empty(result) ? new(false, "The server did not accept the change (lab not found, or your account isn't allowed to change the catalog).") : new(true, null);
    }

    public static async Task<(ExternalLabInput? Lab, string? Error)> LoadExternalLabAsync(SupabaseApi api, string organizationId, string labId, CancellationToken ct = default)
    {
        var result = await api.SelectAsync("external_labs", $"select=name,code,contact_person,phone,email,address,gst_number,notes&id=eq.{labId}&organization_id=eq.{organizationId}&limit=1", ct);
        if (result.NetworkFailure) return (null, "Editing an external lab needs an internet connection.");
        if (!result.Ok) return (null, result.ErrorMessage ?? "Could not load the lab.");
        if (result.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0) return (null, "That lab was not found on the server.");
        var r = rows[0];
        string Text(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        return (new ExternalLabInput(Text("name"), Text("code"), Text("contact_person"), Text("phone"), Text("email"), Text("address"), Text("gst_number"), Text("notes")), null);
    }

    public static async Task<AdminResult> AddCategoryAsync(SupabaseApi api, string organizationId, string name, string description, IEnumerable<string> existingNames, CancellationToken ct = default)
    {
        name = name?.Trim() ?? "";
        if (name.Length == 0) return new(false, "Category name is required.");
        if (name.Length > 120) return new(false, "The name is too long.");
        if (existingNames.Any(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase))) return new(false, "A category with that name already exists.");
        var result = await api.InsertAsync("test_categories", new { name, description = Blank(description), organization_id = organizationId }, ct);
        if (result.Status == 409) return new(false, "A category with that name already exists.");
        return result.Ok ? new(true, null) : Failed(result, "The category");
    }
}
