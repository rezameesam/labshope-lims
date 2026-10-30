using System.Globalization;
using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

/// <summary>What the website's item form holds. <see cref="Stock"/> only counts for a new item: later changes go through bought/used so two people never overwrite each other.</summary>
public sealed record InventoryItemInput(string Name, string Type, string Sku, string Unit, string Stock, string MinStock, string UnitPrice, string Supplier, string Location, string Description);

/// <summary>Adding and editing inventory items and switching them off, with the website's fields.</summary>
public static class InventoryItemAdmin
{
    public static readonly string[] Types = ["supply", "equipment"];

    private static string? Blank(string? t) => string.IsNullOrWhiteSpace(t) ? null : t.Trim();

    private static bool Number(string text, out decimal value)
    {
        value = 0;
        return string.IsNullOrWhiteSpace(text) || (decimal.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out value) && value >= 0);
    }

    private static (Dictionary<string, object?>? Row, string? Error) Row(string organizationId, InventoryItemInput i, bool isNew)
    {
        var name = i.Name?.Trim() ?? "";
        if (name.Length == 0) return (null, "Item name is required.");
        if (name.Length > 160) return (null, "The name is too long.");
        if (!Types.Contains(i.Type)) return (null, "Choose supply or equipment.");
        if (!Number(i.Stock, out var stock)) return (null, "Enter the stock as a number (0 or more).");
        if (!Number(i.MinStock, out var min)) return (null, "Enter the minimum stock as a number (0 or more).");
        if (!Number(i.UnitPrice, out var price)) return (null, "Enter the price as a number (0 or more).");
        var row = new Dictionary<string, object?>
        {
            ["name"] = name,
            ["description"] = Blank(i.Description),
            ["type"] = i.Type,
            ["sku"] = Blank(i.Sku),
            ["unit"] = Blank(i.Unit) ?? "pcs",
            ["min_stock_level"] = min,
            ["unit_price"] = price,
            ["supplier"] = Blank(i.Supplier),
            ["location"] = Blank(i.Location),
            ["organization_id"] = organizationId,
        };
        if (isNew) row["current_stock"] = stock;
        return (row, null);
    }

    private static AdminResult Failed(ApiResult r, string clash) =>
        r.NetworkFailure ? new(false, "Inventory needs an internet connection.")
        : r.Status is 401 or 403 ? new(false, "Your account isn't allowed to change the inventory.")
        : r.Status == 409 ? new(false, clash)
        : new(false, r.ErrorMessage ?? "The item was not saved.");

    public static async Task<AdminResult> AddAsync(SupabaseApi api, string organizationId, InventoryItemInput input, CancellationToken ct = default)
    {
        var (row, error) = Row(organizationId, input, true);
        if (row is null) return new(false, error);
        var result = await api.InsertAsync("inventory_items", row, ct);
        return result.Ok ? new(true, null) : Failed(result, "An item with that SKU already exists.");
    }

    public static async Task<AdminResult> UpdateAsync(SupabaseApi api, string organizationId, string itemId, InventoryItemInput input, CancellationToken ct = default)
    {
        var (row, error) = Row(organizationId, input, false);
        if (row is null) return new(false, error);
        var result = await api.PatchAsync("inventory_items", $"id=eq.{itemId}&organization_id=eq.{organizationId}", row, ct);
        if (!result.Ok) return Failed(result, "An item with that SKU already exists.");
        return result.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0
            ? new(false, "The server did not accept the change (item not found, or your account isn't allowed to change the inventory).") : new(true, null);
    }

    /// <summary>Hides an item from the list (it keeps its history). The website deletes items; switching off is the reversible version of that.</summary>
    public static async Task<AdminResult> SwitchOffAsync(SupabaseApi api, string organizationId, string itemId, CancellationToken ct = default)
    {
        var result = await api.PatchAsync("inventory_items", $"id=eq.{itemId}&organization_id=eq.{organizationId}", new { is_active = false }, ct);
        if (!result.Ok) return Failed(result, "");
        return result.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() == 0
            ? new(false, "The server did not accept the change (item not found, or your account isn't allowed to change the inventory).") : new(true, null);
    }

    /// <summary>Reads the description (not kept in the list) for the edit form.</summary>
    public static async Task<string> LoadDescriptionAsync(SupabaseApi api, string organizationId, string itemId, CancellationToken ct = default)
    {
        var result = await api.SelectAsync("inventory_items", $"select=description&id=eq.{itemId}&organization_id=eq.{organizationId}&limit=1", ct);
        return result.Ok && result.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() > 0
            && rows[0].TryGetProperty("description", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() ?? "" : "";
    }
}
