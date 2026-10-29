using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class InventoryTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly InventoryItem Item = new("i1", "EDTA tubes", "reagent", "ED-1", "pcs", 50m, 20m, 4m, "MedSupply", "Shelf 2");

    // Stock as the server holds it right now (may differ from what the screen showed).
    private static FakeServer Server(decimal stock, Action<HttpRequestMessage, string>? seen = null, bool patchRefused = false) => new()
    {
        Handler = (req, body) =>
        {
            seen?.Invoke(req, body);
            var path = req.RequestUri!.AbsolutePath;
            if (req.Method.Method == "POST") return (HttpStatusCode.Created, "{}");
            if (req.Method.Method == "PATCH") return (HttpStatusCode.OK, patchRefused ? "[]" : "[{\"id\":\"i1\"}]");
            if (path.EndsWith("/inventory_items") && req.RequestUri.Query.Contains("select=current_stock")) return (HttpStatusCode.OK, "[{\"current_stock\":" + stock + "}]");
            return (HttpStatusCode.OK, "[]");
        },
    };

    [Fact]
    public async Task ListsItemsWithLowAndOutOfStockFlags()
    {
        const string rows = """
            [{"id":"a","name":"Gloves","type":"consumable","sku":null,"unit":"box","current_stock":3,"min_stock_level":5,"unit_price":120,"supplier":null,"location":null,"is_active":true},
            {"id":"b","name":"CBC reagent","type":"reagent","sku":"R1","unit":"ml","current_stock":0,"min_stock_level":10,"unit_price":8,"supplier":"X","location":"Fridge","is_active":true},
            {"id":"c","name":"Old stuff","type":"x","sku":null,"unit":null,"current_stock":9,"min_stock_level":1,"unit_price":1,"supplier":null,"location":null,"is_active":false},
            {"id":"d","name":"Slides","type":"consumable","sku":null,"unit":"box","current_stock":40,"min_stock_level":5,"unit_price":50,"supplier":null,"location":null,"is_active":true}]
            """;
        var result = await InventoryService.LoadAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, rows) }), "org-1");

        Assert.Equal(["Gloves", "CBC reagent", "Slides"], result.Items.Select(i => i.Name)); // inactive items are hidden
        Assert.Equal(["low", "out", "ok"], result.Items.Select(i => i.Level));
    }

    [Fact]
    public async Task RecordingUsageLogsItAndLowersTheFreshStockLevel()
    {
        var calls = new List<(string Method, string Url, string Body)>();
        var server = Server(stock: 47m, (r, b) => calls.Add((r.Method.Method, r.RequestUri!.PathAndQuery, b))); // someone else already used 3 since the screen loaded

        var result = await InventoryService.RecordUsageAsync(Api(server), "org-1", "user-1", Item, "5", " run 12 ");

        Assert.True(result.Ok);
        var log = calls.First(c => c.Method == "POST");
        Assert.Contains("/inventory_usage", log.Url);
        var body = JsonDocument.Parse(log.Body).RootElement;
        Assert.Equal((5m, 4m, 20m, "run 12", "user-1"), (body.GetProperty("quantity").GetDecimal(), body.GetProperty("unit_cost").GetDecimal(), body.GetProperty("total_cost").GetDecimal(), body.GetProperty("notes").GetString(), body.GetProperty("recorded_by").GetString()));
        var patch = JsonDocument.Parse(calls.Last(c => c.Method == "PATCH").Body).RootElement;
        Assert.Equal(42m, patch.GetProperty("current_stock").GetDecimal()); // 47 (fresh) - 5, not 50 - 5
    }

    [Fact]
    public async Task RefusesMoreThanIsInStockAndBadQuantitiesWithoutWritingAnything()
    {
        var server = Server(50m);
        Assert.Contains("Only 50", (await InventoryService.RecordUsageAsync(Api(server), "org-1", "u", Item, "51", null)).Error);
        Assert.Contains("greater than zero", (await InventoryService.RecordUsageAsync(Api(server), "org-1", "u", Item, "0", null)).Error);
        Assert.Contains("greater than zero", (await InventoryService.RecordUsageAsync(Api(server), "org-1", "u", Item, "abc", null)).Error);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task RecordingAPurchaseLogsItAndRaisesTheStock()
    {
        var calls = new List<(string Method, string Url, string Body)>();
        var result = await InventoryService.RecordPurchaseAsync(Api(Server(50m, (r, b) => calls.Add((r.Method.Method, r.RequestUri!.PathAndQuery, b)))), "org-1", "user-1", Item, "100", "3.5", "");

        Assert.True(result.Ok);
        var log = JsonDocument.Parse(calls.First(c => c.Method == "POST").Body).RootElement;
        Assert.Equal((100m, 3.5m, 350m, "MedSupply"), (log.GetProperty("quantity").GetDecimal(), log.GetProperty("unit_cost").GetDecimal(), log.GetProperty("total_cost").GetDecimal(), log.GetProperty("supplier").GetString()));
        Assert.Equal(150m, JsonDocument.Parse(calls.Last(c => c.Method == "PATCH").Body).RootElement.GetProperty("current_stock").GetDecimal());
        Assert.Contains("cost per unit", (await InventoryService.RecordPurchaseAsync(Api(Server(1m)), "org-1", "u", Item, "1", "free", null)).Error);
    }

    [Fact]
    public async Task SaysSoWhenTheStockLevelCouldNotBeUpdated()
    {
        var result = await InventoryService.RecordUsageAsync(Api(Server(50m, patchRefused: true)), "org-1", "u", Item, "5", null);
        Assert.False(result.Ok);
        Assert.Contains("Recorded, but the stock level was not updated", result.Error); // so the person checks, instead of recording it twice
    }

    [Fact]
    public async Task ExplainsOffline()
    {
        Assert.True((await InventoryService.LoadAsync(Api(new OfflineServer()), "org-1")).Offline);
        Assert.Contains("internet", (await InventoryService.RecordUsageAsync(Api(new OfflineServer()), "org-1", "u", Item, "1", null)).Error);
    }
}
