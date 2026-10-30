using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class InventoryItemAdminTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly InventoryItemInput Item = new(" CBC reagent ", "supply", "", " ml ", "25", "5", "12.5", "Acme", "Shelf 2", "");

    [Fact]
    public async Task AddsAnItemWithItsOpeningStockAndTheWebsitesDefaults()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        Assert.True((await InventoryItemAdmin.AddAsync(Api(server), "org-1", Item)).Ok);
        var call = server.Requests.Single();
        Assert.EndsWith("/rest/v1/inventory_items", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("CBC reagent", "supply", "ml", 25m, 5m, 12.5m, "org-1"), (body.GetProperty("name").GetString(), body.GetProperty("type").GetString(), body.GetProperty("unit").GetString(),
            body.GetProperty("current_stock").GetDecimal(), body.GetProperty("min_stock_level").GetDecimal(), body.GetProperty("unit_price").GetDecimal(), body.GetProperty("organization_id").GetString()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("sku").ValueKind);

        var plain = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        await InventoryItemAdmin.AddAsync(Api(plain), "org-1", Item with { Unit = " ", Stock = "", MinStock = "", UnitPrice = "" });
        var defaults = JsonDocument.Parse(plain.Requests.Single().Body).RootElement;
        Assert.Equal(("pcs", 0m), (defaults.GetProperty("unit").GetString(), defaults.GetProperty("current_stock").GetDecimal()));
    }

    [Fact]
    public async Task AnEditNeverSendsTheStockLevel()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"i1"}]""") };
        Assert.True((await InventoryItemAdmin.UpdateAsync(Api(server), "org-1", "i1", Item)).Ok);
        var call = server.Requests.Single();
        Assert.Contains("/rest/v1/inventory_items?id=eq.i1&organization_id=eq.org-1", call.Url);
        Assert.False(JsonDocument.Parse(call.Body).RootElement.TryGetProperty("current_stock", out _)); // bought/used move the stock, an edit must not overwrite it
    }

    [Theory]
    [InlineData("", "supply", "10", "name")]
    [InlineData("X", "weird", "10", "supply or equipment")]
    [InlineData("X", "supply", "-1", "stock")]
    [InlineData("X", "supply", "abc", "stock")]
    public async Task RefusesBadInputBeforeAskingTheServer(string name, string type, string stock, string expected)
    {
        var server = new FakeServer();
        var result = await InventoryItemAdmin.AddAsync(Api(server), "org-1", Item with { Name = name, Type = type, Stock = stock });
        Assert.Contains(expected, result.Error, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task ReportsOfflineDeniedClashAndRefusedChanges()
    {
        Assert.Contains("internet", (await InventoryItemAdmin.AddAsync(Api(new OfflineServer()), "org-1", Item)).Error);
        Assert.Contains("isn't allowed", (await InventoryItemAdmin.AddAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") }), "org-1", Item)).Error);
        Assert.Contains("SKU", (await InventoryItemAdmin.AddAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, "{}") }), "org-1", Item)).Error);
        var refused = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };
        Assert.False((await InventoryItemAdmin.UpdateAsync(Api(refused), "org-1", "i1", Item)).Ok);
        Assert.False((await InventoryItemAdmin.SwitchOffAsync(Api(refused), "org-1", "i1")).Ok);
    }

    [Fact]
    public async Task SwitchingOffHidesTheItemAndTheDescriptionIsReadForEditing()
    {
        var off = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"i1"}]""") };
        Assert.True((await InventoryItemAdmin.SwitchOffAsync(Api(off), "org-1", "i1")).Ok);
        Assert.False(JsonDocument.Parse(off.Requests.Single().Body).RootElement.GetProperty("is_active").GetBoolean());

        var read = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"description":"Store cold"}]""") };
        Assert.Equal("Store cold", await InventoryItemAdmin.LoadDescriptionAsync(Api(read), "org-1", "i1"));
        Assert.Equal("", await InventoryItemAdmin.LoadDescriptionAsync(Api(new OfflineServer()), "org-1", "i1"));
    }
}
