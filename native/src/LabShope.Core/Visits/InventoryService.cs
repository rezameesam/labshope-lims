using System.Globalization;
using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record InventoryItem(string Id, string Name, string Type, string? Sku, string? Unit, decimal CurrentStock, decimal MinStock, decimal UnitPrice, string? Supplier, string? Location)
{
    public bool Low => CurrentStock <= MinStock;
    public string Level => CurrentStock <= 0 ? "out" : Low ? "low" : "ok";
}

public sealed record InventoryResult(IReadOnlyList<InventoryItem> Items, string? Error, bool Offline);

/// <summary>
/// Reagents and consumables, as the website's Inventory tab keeps them: items with a stock level and a minimum, plus a log of
/// stock bought and stock used. Recording one adds a log line and moves the item's stock (the website's own two steps).
/// Needs the internet.
/// </summary>
public static class InventoryService
{
    public static async Task<InventoryResult> LoadAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var (rows, failure) = await api.SelectAllAsync("inventory_items",
            $"select=id,name,type,sku,unit,current_stock,min_stock_level,unit_price,supplier,location,is_active&organization_id=eq.{organizationId}&order=name.asc", ct: ct);
        if (failure is not null)
            return failure.NetworkFailure ? new InventoryResult([], "Inventory needs an internet connection.", true)
                : new InventoryResult([], failure.Status is 401 or 403 ? "Your account isn't allowed to see the inventory." : failure.ErrorMessage ?? "Could not load the inventory.", false);

        static string? S(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        static decimal D(JsonElement r, string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;
        var items = rows
            .Where(r => !(r.TryGetProperty("is_active", out var a) && a.ValueKind == JsonValueKind.False))
            .Select(r => new InventoryItem(S(r, "id")!, S(r, "name") ?? "", S(r, "type") ?? "", S(r, "sku"), S(r, "unit"),
                D(r, "current_stock"), D(r, "min_stock_level"), D(r, "unit_price"), S(r, "supplier"), S(r, "location"))).ToList();
        return new InventoryResult(items, null, false);
    }

    public static Task<AdminResult> RecordUsageAsync(SupabaseApi api, string organizationId, string? userId, InventoryItem item, string quantity, string? notes, CancellationToken ct = default) =>
        RecordAsync(api, organizationId, item.Id, quantity, positive: false, async qty =>
        {
            if (qty > item.CurrentStock) return new AdminResult(false, $"Only {item.CurrentStock:0.##} {item.Unit} in stock.");
            var saved = await api.InsertAsync("inventory_usage", new
            {
                item_id = item.Id, organization_id = organizationId, quantity = qty, unit_cost = item.UnitPrice, total_cost = qty * item.UnitPrice,
                notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(), recorded_by = userId,
            }, ct);
            return Outcome(saved, "The usage could not be saved.");
        }, ct);

    public static Task<AdminResult> RecordPurchaseAsync(SupabaseApi api, string organizationId, string? userId, InventoryItem item, string quantity, string unitCost, string? supplier, CancellationToken ct = default) =>
        RecordAsync(api, organizationId, item.Id, quantity, positive: true, async qty =>
        {
            if (!decimal.TryParse(unitCost.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var cost) || cost < 0) return new AdminResult(false, "Enter the cost per unit as a number.");
            var saved = await api.InsertAsync("inventory_purchases", new
            {
                item_id = item.Id, organization_id = organizationId, quantity = qty, unit_cost = cost, total_cost = qty * cost,
                supplier = string.IsNullOrWhiteSpace(supplier) ? item.Supplier : supplier.Trim(), purchased_by = userId,
            }, ct);
            return Outcome(saved, "The purchase could not be saved.");
        }, ct);

    private static AdminResult Outcome(ApiResult saved, string failure) =>
        saved.Ok ? new AdminResult(true, null)
        : saved.NetworkFailure ? new AdminResult(false, "Inventory needs an internet connection.")
        : new AdminResult(false, saved.Status is 401 or 403 ? "Your account isn't allowed to change the inventory." : failure);

    /// <summary>Validates the quantity, writes the log line, then moves the stock using the freshly read level (not a stale one).</summary>
    private static async Task<AdminResult> RecordAsync(SupabaseApi api, string organizationId, string itemId, string quantityText, bool positive, Func<decimal, Task<AdminResult>> writeLog, CancellationToken ct)
    {
        if (!decimal.TryParse(quantityText.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var qty) || qty <= 0)
            return new AdminResult(false, "Enter a quantity greater than zero.");

        var log = await writeLog(qty);
        if (!log.Ok) return log;

        var fresh = await api.SelectAsync("inventory_items", $"select=current_stock&id=eq.{itemId}&organization_id=eq.{organizationId}&limit=1", ct);
        if (fresh.NetworkFailure) return new AdminResult(false, "Inventory needs an internet connection.");
        var current = fresh.Body is { ValueKind: JsonValueKind.Array } a && a.GetArrayLength() > 0 && a[0].TryGetProperty("current_stock", out var cs) && cs.ValueKind == JsonValueKind.Number ? cs.GetDecimal() : (decimal?)null;
        if (current is null) return new AdminResult(false, "Recorded, but the stock level could not be read. Refresh and check it.");

        var next = positive ? current.Value + qty : Math.Max(current.Value - qty, 0);
        var update = await api.PatchAsync("inventory_items", $"id=eq.{itemId}&organization_id=eq.{organizationId}", new { current_stock = next }, ct);
        return update.Ok && update.Body is { ValueKind: JsonValueKind.Array } rows && rows.GetArrayLength() > 0
            ? new AdminResult(true, null)
            : new AdminResult(false, "Recorded, but the stock level was not updated. Refresh and check it.");
    }
}
