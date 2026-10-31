using System.Net;
using System.Text;
using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Finance;

public sealed record AccountInfo(string Id, string Code, string Name, string Type, string? Description, bool IsActive)
{
    public string Display => $"{Code} - {Name}";
    public string Status => IsActive ? "Active" : "Switched off";
}

public sealed record LedgerLine(string Date, string EntryNumber, string Description, string? Reference, decimal Debit, decimal Credit, decimal Balance);

public sealed record Ledger(AccountInfo Account, IReadOnlyList<LedgerLine> Lines)
{
    public decimal TotalDebit => Lines.Sum(l => l.Debit);
    public decimal TotalCredit => Lines.Sum(l => l.Credit);
    public decimal Closing => Lines.Count == 0 ? 0 : Lines[^1].Balance;
}

public sealed record LedgerResult<T>(T? Data, string? Error, bool Offline) where T : class;

/// <summary>The chart of accounts and one account's ledger (same as the website's Finance tab), read from the server.</summary>
public static class Ledgers
{
    /// <summary>Assets and expenses grow with debits; the rest grow with credits.</summary>
    public static bool DebitNormal(string type) => type is "asset" or "expense";

    public static Ledger Build(AccountInfo account, IEnumerable<(string Date, string EntryNumber, string Description, string? Reference, decimal Debit, decimal Credit)> rows)
    {
        var running = 0m;
        var lines = rows.OrderBy(r => r.Date, StringComparer.Ordinal).ThenBy(r => r.EntryNumber, StringComparer.Ordinal).Select(r =>
        {
            running += DebitNormal(account.Type) ? r.Debit - r.Credit : r.Credit - r.Debit;
            return new LedgerLine(r.Date, r.EntryNumber, r.Description, r.Reference, r.Debit, r.Credit, running);
        }).ToList();
        return new Ledger(account, lines);
    }

    public static async Task<LedgerResult<IReadOnlyList<AccountInfo>>> ChartAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var (rows, failure) = await api.SelectAllAsync("accounts", $"select=id,code,name,type,description,is_active&organization_id=eq.{organizationId}&order=code.asc", ct: ct);
        if (failure is not null) return Fail<IReadOnlyList<AccountInfo>>(failure);
        IReadOnlyList<AccountInfo> list = rows.Select(a => new AccountInfo(Str(a, "id") ?? "", Str(a, "code") ?? "", Str(a, "name") ?? "", Str(a, "type") ?? "", Str(a, "description"),
            !a.TryGetProperty("is_active", out var v) || v.ValueKind != JsonValueKind.False)).ToList();
        return new LedgerResult<IReadOnlyList<AccountInfo>>(list, null, false);
    }

    public static async Task<LedgerResult<Ledger>> LedgerAsync(SupabaseApi api, string organizationId, AccountInfo account, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var (entries, entriesFailure) = await api.SelectAllAsync("journal_entries",
            $"select=id,entry_number,entry_date,description,reference&organization_id=eq.{organizationId}&status=eq.posted&entry_date=gte.{from:yyyy-MM-dd}&entry_date=lte.{to:yyyy-MM-dd}", ct: ct);
        if (entriesFailure is not null) return Fail<Ledger>(entriesFailure);

        var byId = entries.ToDictionary(e => Str(e, "id") ?? "");
        var rows = new List<(string, string, string, string?, decimal, decimal)>();
        var ids = byId.Keys.ToList();
        for (var i = 0; i < ids.Count; i += 100)
        {
            var (lines, linesFailure) = await api.SelectAllAsync("journal_entry_lines",
                $"select=journal_entry_id,debit,credit,description&account_id=eq.{account.Id}&journal_entry_id=in.({string.Join(",", ids.Skip(i).Take(100))})", ct: ct);
            if (linesFailure is not null) return Fail<Ledger>(linesFailure);
            foreach (var l in lines)
            {
                var e = byId[Str(l, "journal_entry_id") ?? ""];
                rows.Add((Str(e, "entry_date") ?? "", Str(e, "entry_number") ?? "", Str(l, "description") ?? Str(e, "description") ?? "", Str(e, "reference"), Dec(l, "debit"), Dec(l, "credit")));
            }
        }
        return new LedgerResult<Ledger>(Build(account, rows), null, false);
    }

    public static string ToHtml(string labName, Ledger l, DateOnly from, DateOnly to, DateTime printedAt)
    {
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        string M(decimal v) => v.ToString("N2");
        var sb = new StringBuilder("<!doctype html><html><head><meta charset=\"utf-8\"><title>Ledger</title><style>")
            .Append("@page{size:A4;margin:14mm}body{font:12px/1.4 Helvetica,Arial,sans-serif;color:#111;max-width:190mm;margin:0 auto}h1{font-size:18px;margin:0}h2{font-size:13px;color:#555;margin:2px 0 6px;font-weight:normal}")
            .Append("table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:5px 6px;font-size:11px;text-align:left}th{border-bottom:2px solid #333}td{border-bottom:1px solid #eee}.r{text-align:right;font-family:monospace}")
            .Append(".total td{font-weight:700;border-top:2px solid #333}</style></head><body><h1>").Append(E(l.Account.Code)).Append(" - ").Append(E(l.Account.Name)).Append("</h1><h2>").Append(E(labName)).Append(" · ")
            .Append(from.ToString("dd/MM/yyyy")).Append(" to ").Append(to.ToString("dd/MM/yyyy")).Append("</h2><table><tr><th>Date</th><th>Entry</th><th>Description</th><th class=\"r\">Debit</th><th class=\"r\">Credit</th><th class=\"r\">Balance</th></tr>");
        foreach (var x in l.Lines)
            sb.Append("<tr><td>").Append(E(x.Date)).Append("</td><td>").Append(E(x.EntryNumber)).Append("</td><td>").Append(E(x.Description)).Append("</td><td class=\"r\">").Append(x.Debit == 0 ? "" : M(x.Debit))
              .Append("</td><td class=\"r\">").Append(x.Credit == 0 ? "" : M(x.Credit)).Append("</td><td class=\"r\">").Append(M(x.Balance)).Append("</td></tr>");
        sb.Append("<tr class=\"total\"><td colspan=\"3\">Total</td><td class=\"r\">").Append(M(l.TotalDebit)).Append("</td><td class=\"r\">").Append(M(l.TotalCredit)).Append("</td><td class=\"r\">").Append(M(l.Closing))
          .Append("</td></tr></table><p style=\"font-size:10px;color:#999;margin-top:14px\">Generated ").Append(printedAt.ToString("dd/MM/yyyy HH:mm")).Append("</p></body></html>");
        return sb.ToString();
    }

    private static LedgerResult<T> Fail<T>(ApiResult f) where T : class => f.NetworkFailure
        ? new LedgerResult<T>(null, "This needs an internet connection.", true)
        : new LedgerResult<T>(null, f.Status is 401 or 403 ? "Your account isn't allowed to see the books." : f.ErrorMessage ?? "Could not load the books.", false);

    private static decimal Dec(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;

    private static string? Str(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
