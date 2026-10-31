using System.Net;
using System.Text;
using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Finance;

public sealed record OutsourcedTest(string TestName, string PatientName, string PatientCode, string Lab, string Date, decimal Cost, decimal SellPrice)
{
    public decimal Margin => SellPrice - Cost;
}

public sealed record LabSummary(string Lab, int Count, decimal Cost, decimal Revenue)
{
    public decimal Margin => Revenue - Cost;
}

public sealed record OutsourceReport(IReadOnlyList<OutsourcedTest> Tests, IReadOnlyList<LabSummary> Labs)
{
    public decimal TotalCost => Tests.Sum(t => t.Cost);
    public decimal TotalRevenue => Tests.Sum(t => t.SellPrice);
    public decimal TotalMargin => TotalRevenue - TotalCost;
}

public sealed record OutsourceResult(OutsourceReport? Data, string? Error, bool Offline);

/// <summary>Tests sent to outside labs in a period: what they cost, what the patient was billed and the margin, per outside lab (same as the website's Outsource report).</summary>
public static class OutsourceReports
{
    public static OutsourceReport Build(IEnumerable<OutsourcedTest> tests)
    {
        var list = tests.OrderByDescending(t => t.Date, StringComparer.Ordinal).ToList();
        var labs = list.GroupBy(t => t.Lab).Select(g => new LabSummary(g.Key, g.Count(), g.Sum(t => t.Cost), g.Sum(t => t.SellPrice))).ToList();
        return new OutsourceReport(list, labs);
    }

    public static async Task<OutsourceResult> LoadAsync(SupabaseApi api, string organizationId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        static OutsourceResult Failed(ApiResult f) => f.NetworkFailure
            ? new OutsourceResult(null, "The outsource report needs an internet connection.", true)
            : new OutsourceResult(null, f.Status is 401 or 403 ? "Your account isn't allowed to see this report." : f.ErrorMessage ?? "Could not load the report.", false);

        var (rows, failure) = await api.SelectAllAsync("patient_tests",
            "select=id,test_name,outsource_cost,outsourced_at,patients(patient_id,full_name),external_labs:external_lab_id(name)" +
            $"&organization_id=eq.{organizationId}&external_lab_id=not.is.null&outsourced_at=gte.{from:yyyy-MM-dd}&outsourced_at=lte.{to:yyyy-MM-dd}T23:59:59&order=outsourced_at.desc", ct: ct);
        if (failure is not null) return Failed(failure);

        // What the patient was billed for each test comes from the bill lines.
        var sell = new Dictionary<string, decimal>();
        var ids = rows.Select(r => r.GetProperty("id").GetString()!).ToList();
        for (var i = 0; i < ids.Count; i += 100)
        {
            var (items, itemsFailure) = await api.SelectAllAsync("invoice_items", $"select=patient_test_id,amount&patient_test_id=in.({string.Join(",", ids.Skip(i).Take(100))})", ct: ct);
            if (itemsFailure is not null) return Failed(itemsFailure);
            foreach (var item in items)
                if (Str(item, "patient_test_id") is { } id) sell[id] = Dec(item, "amount");
        }

        var tests = rows.Select(r =>
        {
            var patient = r.TryGetProperty("patients", out var p) && p.ValueKind == JsonValueKind.Object ? p : (JsonElement?)null;
            var lab = r.TryGetProperty("external_labs", out var l) && l.ValueKind == JsonValueKind.Object ? Str(l, "name") : null;
            return new OutsourcedTest(Str(r, "test_name") ?? "", patient is { } pp ? Str(pp, "full_name") ?? "" : "", patient is { } pc ? Str(pc, "patient_id") ?? "" : "",
                lab ?? "Unknown", (Str(r, "outsourced_at") ?? "")[..Math.Min(10, (Str(r, "outsourced_at") ?? "").Length)], Dec(r, "outsource_cost"), sell.GetValueOrDefault(Str(r, "id") ?? ""));
        });
        return new OutsourceResult(Build(tests), null, false);
    }

    public static string ToHtml(string labName, OutsourceReport r, DateOnly from, DateOnly to, DateTime printedAt)
    {
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        string M(decimal v) => v.ToString("N2");
        var sb = new StringBuilder("<!doctype html><html><head><meta charset=\"utf-8\"><title>Outsource report</title><style>")
            .Append("@page{size:A4;margin:14mm}body{font:12px/1.4 Helvetica,Arial,sans-serif;color:#111;max-width:190mm;margin:0 auto}h1{font-size:20px;margin:0}h2{font-size:14px;color:#555;margin:2px 0 6px}")
            .Append("table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:5px 6px;font-size:11px;text-align:left}th{border-bottom:2px solid #333}td{border-bottom:1px solid #eee}.r{text-align:right;font-family:monospace}")
            .Append(".total td{font-weight:700;border-top:2px solid #333}.neg{color:#dc2626}</style></head><body><h1>").Append(E(labName)).Append("</h1><h2>Outsource report - ")
            .Append(from.ToString("dd/MM/yyyy")).Append(" to ").Append(to.ToString("dd/MM/yyyy")).Append("</h2><table><tr><th>Outside lab</th><th class=\"r\">Tests</th><th class=\"r\">Cost</th><th class=\"r\">Billed</th><th class=\"r\">Margin</th></tr>");
        foreach (var l in r.Labs)
            sb.Append("<tr><td>").Append(E(l.Lab)).Append("</td><td class=\"r\">").Append(l.Count).Append("</td><td class=\"r\">").Append(M(l.Cost)).Append("</td><td class=\"r\">").Append(M(l.Revenue))
              .Append("</td><td class=\"r").Append(l.Margin < 0 ? " neg" : "").Append("\">").Append(M(l.Margin)).Append("</td></tr>");
        sb.Append("<tr class=\"total\"><td>Total</td><td class=\"r\">").Append(r.Tests.Count).Append("</td><td class=\"r\">").Append(M(r.TotalCost)).Append("</td><td class=\"r\">").Append(M(r.TotalRevenue))
          .Append("</td><td class=\"r\">").Append(M(r.TotalMargin)).Append("</td></tr></table><table><tr><th>Date</th><th>Patient</th><th>Test</th><th>Outside lab</th><th class=\"r\">Cost</th><th class=\"r\">Billed</th><th class=\"r\">Margin</th></tr>");
        foreach (var t in r.Tests)
            sb.Append("<tr><td>").Append(E(t.Date)).Append("</td><td>").Append(E(t.PatientName)).Append(" (").Append(E(t.PatientCode)).Append(")</td><td>").Append(E(t.TestName)).Append("</td><td>").Append(E(t.Lab))
              .Append("</td><td class=\"r\">").Append(M(t.Cost)).Append("</td><td class=\"r\">").Append(M(t.SellPrice)).Append("</td><td class=\"r").Append(t.Margin < 0 ? " neg" : "").Append("\">").Append(M(t.Margin)).Append("</td></tr>");
        sb.Append("</table><p style=\"font-size:10px;color:#999;margin-top:14px\">Generated ").Append(printedAt.ToString("dd/MM/yyyy HH:mm")).Append("</p></body></html>");
        return sb.ToString();
    }

    private static decimal Dec(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;

    private static string? Str(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
