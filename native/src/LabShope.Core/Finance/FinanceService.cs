using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Finance;

public sealed record AccountBalance(string Id, string Code, string Name, string Type, decimal TotalDebit, decimal TotalCredit)
{
    public decimal Net => TotalDebit - TotalCredit;
    public decimal ClosingDebit => Net > 0 ? Net : 0;
    public decimal ClosingCredit => Net < 0 ? -Net : 0;
}

public sealed record JournalLine(string EntryNumber, string EntryDate, string Description, string? Reference, decimal Amount);

public sealed record TrialBalance(
    IReadOnlyList<AccountBalance> Accounts, IReadOnlyList<JournalLine> RecentEntries,
    decimal TotalDebit, decimal TotalCredit, int EntryCount)
{
    /// <summary>The books balance when everything debited equals everything credited.</summary>
    public bool Tallied => Math.Abs(TotalDebit - TotalCredit) < 0.01m;
}

public sealed record FinanceResult(TrialBalance? Data, string? Error, bool Offline);

/// <summary>
/// Reads the lab's books (the same accounts and posted journal entries the website's Finance tab shows).
/// Everything is posted to the books automatically on the server when bills and payments sync, so this screen is
/// read-only and needs the internet.
/// </summary>
public static class FinanceService
{
    /// <summary>The Indian financial year containing <paramref name="today"/> (1 April to 31 March).</summary>
    public static (DateOnly Start, DateOnly End) FinancialYear(DateOnly today)
    {
        var startYear = today.Month >= 4 ? today.Year : today.Year - 1;
        return (new DateOnly(startYear, 4, 1), new DateOnly(startYear + 1, 3, 31));
    }

    public static async Task<FinanceResult> LoadAsync(SupabaseApi api, string organizationId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        static FinanceResult Failed(ApiResult f) => f.NetworkFailure
            ? new FinanceResult(null, "Finance needs an internet connection. Bills and payments are posted to the books automatically once they sync.", true)
            : new FinanceResult(null, f.Status is 401 or 403 ? "Your account isn't allowed to see the books." : f.ErrorMessage ?? "Could not load the books.", false);

        var (accounts, accountsFailure) = await api.SelectAllAsync("accounts",
            $"select=id,code,name,type&organization_id=eq.{organizationId}&is_active=eq.true&order=code.asc", ct: ct);
        if (accountsFailure is not null) return Failed(accountsFailure);

        var (entries, entriesFailure) = await api.SelectAllAsync("journal_entries",
            $"select=id,entry_number,entry_date,description,reference&organization_id=eq.{organizationId}&status=eq.posted" +
            $"&entry_date=gte.{from:yyyy-MM-dd}&entry_date=lte.{to:yyyy-MM-dd}&order=entry_date.desc,entry_number.desc", ct: ct);
        if (entriesFailure is not null) return Failed(entriesFailure);

        var debit = new Dictionary<string, decimal>();
        var credit = new Dictionary<string, decimal>();
        var entryTotals = new Dictionary<string, decimal>();

        // The id list goes in the web address, so fetch the lines in chunks.
        var ids = entries.Select(e => e.GetProperty("id").GetString()!).ToList();
        for (var i = 0; i < ids.Count; i += 100)
        {
            var chunk = string.Join(",", ids.Skip(i).Take(100));
            var (lines, linesFailure) = await api.SelectAllAsync("journal_entry_lines",
                $"select=journal_entry_id,account_id,debit,credit&journal_entry_id=in.({chunk})", ct: ct);
            if (linesFailure is not null) return Failed(linesFailure);

            foreach (var l in lines)
            {
                var account = l.GetProperty("account_id").GetString()!;
                var d = Dec(l, "debit"); var c = Dec(l, "credit");
                debit[account] = debit.GetValueOrDefault(account) + d;
                credit[account] = credit.GetValueOrDefault(account) + c;
                var entry = l.GetProperty("journal_entry_id").GetString()!;
                entryTotals[entry] = entryTotals.GetValueOrDefault(entry) + d;
            }
        }

        var balances = accounts
            .Select(a =>
            {
                var id = a.GetProperty("id").GetString()!;
                return new AccountBalance(id, a.GetProperty("code").GetString() ?? "", a.GetProperty("name").GetString() ?? "", a.GetProperty("type").GetString() ?? "",
                    debit.GetValueOrDefault(id), credit.GetValueOrDefault(id));
            })
            .Where(b => b.TotalDebit != 0 || b.TotalCredit != 0)
            .ToList();

        var recent = entries.Take(200).Select(e => new JournalLine(
            Str(e, "entry_number") ?? "", Str(e, "entry_date") ?? "", Str(e, "description") ?? "", Str(e, "reference"),
            entryTotals.GetValueOrDefault(e.GetProperty("id").GetString()!))).ToList();

        return new FinanceResult(new TrialBalance(balances, recent, balances.Sum(b => b.TotalDebit), balances.Sum(b => b.TotalCredit), entries.Count), null, false);
    }

    private static decimal Dec(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;

    private static string? Str(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
