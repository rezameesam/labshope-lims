using System.Globalization;
using System.Net;
using System.Text;

namespace LabShope.Core.Finance;

/// <summary>One row of a statement: a heading, an account line, a total, or the bottom line.</summary>
public sealed record StatementLine(string Code, string Label, decimal? Amount, string Kind)
{
    public string AmountText => Amount is { } a ? a.ToString("N2", CultureInfo.InvariantCulture) : "";
    public bool Bold => Kind is "heading" or "total" or "net";
}

public sealed record Statement(string Title, IReadOnlyList<StatementLine> Lines, decimal Left, decimal Right, string Summary, bool Good);

/// <summary>
/// The website's Profit &amp; Loss and Balance Sheet, worked out from the account balances (debits and credits) for a period:
/// revenue and liabilities/equity count credit minus debit, assets and expenses debit minus credit. Accounts at zero are left out.
/// </summary>
public static class Statements
{
    public static Statement ProfitAndLoss(IEnumerable<AccountBalance> accounts, DateOnly from, DateOnly to)
    {
        var revenue = accounts.Where(a => a.Type == "revenue").Select(a => (a, Amount: a.TotalCredit - a.TotalDebit)).Where(x => x.Amount != 0).ToList();
        var expenses = accounts.Where(a => a.Type == "expense").Select(a => (a, Amount: a.TotalDebit - a.TotalCredit)).Where(x => x.Amount != 0).ToList();
        var totalRevenue = revenue.Sum(x => x.Amount);
        var totalExpenses = expenses.Sum(x => x.Amount);
        var net = totalRevenue - totalExpenses;
        var margin = totalRevenue > 0 ? net / totalRevenue * 100 : 0;

        var lines = new List<StatementLine> { new("", "Revenue", null, "heading") };
        lines.AddRange(revenue.Select(x => new StatementLine(x.a.Code, x.a.Name, x.Amount, "line")));
        lines.Add(new("", "Total revenue", totalRevenue, "total"));
        lines.Add(new("", "Expenses", null, "heading"));
        lines.AddRange(expenses.Select(x => new StatementLine(x.a.Code, x.a.Name, x.Amount, "line")));
        lines.Add(new("", "Total expenses", totalExpenses, "total"));
        lines.Add(new("", net >= 0 ? "Net profit" : "Net loss", net, "net"));
        return new($"Profit & Loss, {from:d MMM yyyy} to {to:d MMM yyyy}", lines, totalRevenue, totalExpenses,
            $"{(net >= 0 ? "Profit" : "Loss")} {Math.Abs(net):N2}  ·  margin {margin:0.#}%", net >= 0);
    }

    /// <param name="accounts">Balances from the very start of the books up to <paramref name="asOf"/>.</param>
    public static Statement BalanceSheet(IEnumerable<AccountBalance> accounts, DateOnly asOf)
    {
        var all = accounts.ToList();
        var assets = all.Where(a => a.Type == "asset").Select(a => (a, Amount: a.TotalDebit - a.TotalCredit)).Where(x => x.Amount != 0).ToList();
        var liabilities = all.Where(a => a.Type == "liability").Select(a => (a, Amount: a.TotalCredit - a.TotalDebit)).Where(x => x.Amount != 0).ToList();
        var equity = all.Where(a => a.Type == "equity").Select(a => (a, Amount: a.TotalCredit - a.TotalDebit)).Where(x => x.Amount != 0).ToList();
        var net = all.Where(a => a.Type == "revenue").Sum(a => a.TotalCredit - a.TotalDebit) - all.Where(a => a.Type == "expense").Sum(a => a.TotalDebit - a.TotalCredit);

        var totalAssets = assets.Sum(x => x.Amount);
        var totalLiabilities = liabilities.Sum(x => x.Amount);
        var totalEquity = equity.Sum(x => x.Amount) + net;
        var balanced = Math.Abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01m;

        var lines = new List<StatementLine> { new("", "Assets", null, "heading") };
        lines.AddRange(assets.Select(x => new StatementLine(x.a.Code, x.a.Name, x.Amount, "line")));
        lines.Add(new("", "Total assets", totalAssets, "total"));
        lines.Add(new("", "Liabilities", null, "heading"));
        lines.AddRange(liabilities.Select(x => new StatementLine(x.a.Code, x.a.Name, x.Amount, "line")));
        lines.Add(new("", "Total liabilities", totalLiabilities, "total"));
        lines.Add(new("", "Equity", null, "heading"));
        lines.AddRange(equity.Select(x => new StatementLine(x.a.Code, x.a.Name, x.Amount, "line")));
        lines.Add(new("", "Profit for the period (not yet closed)", net, "line"));
        lines.Add(new("", "Total equity", totalEquity, "total"));
        lines.Add(new("", "Total liabilities and equity", totalLiabilities + totalEquity, "net"));
        return new($"Balance Sheet as of {asOf:d MMM yyyy}", lines, totalAssets, totalLiabilities + totalEquity,
            balanced ? $"Balanced · {totalAssets:N2}" : $"Out of balance by {Math.Abs(totalAssets - totalLiabilities - totalEquity):N2}", balanced);
    }

    /// <summary>A printable page for the lab's accountant: the statement under the lab's name.</summary>
    public static string ToHtml(string labName, Statement s, DateTime printedAt)
    {
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        var sb = new StringBuilder("<!doctype html><html><head><meta charset=\"utf-8\"><title>").Append(E(s.Title)).Append("</title><style>")
            .Append("@page{size:A4;margin:16mm}body{font:12px/1.4 Helvetica,Arial,sans-serif;color:#111;max-width:180mm;margin:0 auto}h1{font-size:20px;margin:0}h2{font-size:14px;color:#555;margin:2px 0 14px}")
            .Append("table{width:100%;border-collapse:collapse}td{padding:4px 6px;border-bottom:1px solid #eee}td.c{font-family:monospace;color:#888;width:60px}td.a{text-align:right;font-family:monospace;width:110px}")
            .Append(".heading td{font-weight:700;border-bottom:2px solid #333;padding-top:12px}.total td{font-weight:700;border-top:1px solid #333}.net td{font-weight:700;font-size:13px;border-top:2px solid #333;border-bottom:3px double #333}")
            .Append("</style></head><body><h1>").Append(E(labName)).Append("</h1><h2>").Append(E(s.Title)).Append("</h2><table>");
        foreach (var l in s.Lines)
            sb.Append("<tr class=\"").Append(l.Kind).Append("\"><td class=\"c\">").Append(E(l.Code)).Append("</td><td>").Append(E(l.Label)).Append("</td><td class=\"a\">").Append(E(l.AmountText)).Append("</td></tr>");
        sb.Append("</table><p style=\"margin-top:14px\">").Append(E(s.Summary)).Append("</p><p style=\"font-size:10px;color:#999\">Generated ").Append(E(printedAt.ToString("dd/MM/yyyy HH:mm"))).Append("</p></body></html>");
        return sb.ToString();
    }
}
