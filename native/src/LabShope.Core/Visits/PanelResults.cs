using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace LabShope.Core.Visits;

/// <summary>One row of a multi-value result (e.g. one CBC parameter). Same shape the website stores in result_items.</summary>
public sealed record ResultItem(string Name, string Value, string Unit, string Min, string Max, string RangeText)
{
    public static ResultItem Blank => new("", "", "", "", "", "");

    private static decimal? Num(string s) =>
        decimal.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : null;

    /// <summary>True when the value is a number outside the row's numeric range (the website's rule).</summary>
    public bool IsAbnormal => Num(Value) is { } v && ((Num(Min) is { } lo && v < lo) || (Num(Max) is { } hi && v > hi));

    public bool IsEmpty => Name.Trim() == "" && Value.Trim() == "" && Unit.Trim() == "" && RangeText.Trim() == "";

    /// <summary>The website's stored form: value is a number when it looks like one, otherwise the text.</summary>
    public JsonObject ToJson() => new()
    {
        ["name"] = Name.Trim(),
        ["value"] = Value.Trim() == "" ? null : Num(Value) is { } n ? n : Value.Trim(),
        ["unit"] = Unit.Trim() == "" ? null : Unit.Trim(),
        ["normal_range_min"] = Num(Min),
        ["normal_range_max"] = Num(Max),
        ["normal_range_text"] = RangeText.Trim() == "" ? null : RangeText.Trim(),
    };

    public static ResultItem From(JsonElement e)
    {
        string S(string name) => e.TryGetProperty(name, out var v) ? v.ValueKind switch
        {
            JsonValueKind.String => v.GetString() ?? "",
            JsonValueKind.Number => v.GetDecimal().ToString(CultureInfo.InvariantCulture),
            _ => "",
        } : "";
        return new ResultItem(S("name"), S("value"), S("unit"), S("normal_range_min"), S("normal_range_max"), S("normal_range_text"));
    }

    public static IReadOnlyList<ResultItem> ParseAll(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonDocument.Parse(json).RootElement.EnumerateArray().Select(From).ToList(); }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException) { return []; }
    }

    public static string ToJsonArray(IEnumerable<ResultItem> items) =>
        new JsonArray(items.Where(i => !i.IsEmpty).Select(i => (JsonNode)i.ToJson()).ToArray()).ToJsonString();
}

/// <summary>The rows a panel starts with. The website only has a built-in list for CBC; other tests start empty.</summary>
public static class PanelDefaults
{
    public static IReadOnlyList<ResultItem> For(string? testName)
    {
        var name = testName?.ToLowerInvariant() ?? "";
        if (!(name.Contains("cbc") || name.Contains("complete blood"))) return [];

        ResultItem R(string n, string unit, string min, string max) => new(n, "", unit, min, max, "");
        return
        [
            R("WBC", "10^9/L", "3.5", "10.0"), R("LYM", "10^9/L", "0.5", "5.0"), R("MID", "10^9/L", "0.1", "1.5"), R("GRAN", "10^9/L", "1.2", "8.0"),
            R("LYM%", "%", "15.0", "50.0"), R("MID%", "%", "2.0", "15.0"), R("GRA%", "%", "35.0", "80.0"),
            R("HGB", "g/dL", "11.5", "16.5"), R("RBC", "10^12/L", "3.50", "5.50"), R("MCV", "fL", "75.0", "100.0"), R("HCT", "%", "35.0", "50.0"),
            R("MCH", "pg", "25.0", "35.0"), R("MCHC", "g/dL", "31.0", "38.0"), R("RDW%", "%", "11.0", "16.0"), R("RDWa", "fL", "30.0", "150.0"),
            R("PLT", "10^9/L", "100", "400"), R("MPV", "fL", "8.0", "11.0"), R("PCT", "%", "0.01", "9.99"), R("PDW", "fL", "0.1", "99.9"), R("LPCR", "%", "0.1", "99.9"),
        ];
    }
}
