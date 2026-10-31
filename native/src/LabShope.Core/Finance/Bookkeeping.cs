using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Finance;

public sealed record JournalDraftLine(string AccountId, string? Description, decimal Debit, decimal Credit);

public sealed record BookResult(bool Ok, string? Error = null, string? Detail = null);

/// <summary>A ready-made entry for the common cases (same four as the website): which account types go on each side.</summary>
public sealed record QuickKind(string Id, string Label, string Hint, string[] FromTypes, string FromLabel, string[] ToTypes, string ToLabel);

/// <summary>Writing to the books by hand: manual journal entries, quick entries and adding or changing accounts (same rules as the website).</summary>
public static class Bookkeeping
{
    public static readonly IReadOnlyList<QuickKind> QuickKinds =
    [
        new("capital", "Capital investment", "Owner puts money into the business", ["equity"], "Capital account", ["asset"], "Money goes to"),
        new("income", "Record income", "Receive money from a patient or client", ["revenue"], "Revenue type", ["asset"], "Money goes to"),
        new("expense", "Record expense", "Pay for an expense from cash or bank", ["asset"], "Pay from", ["expense"], "Expense type"),
        new("transfer", "Transfer between accounts", "Move money from one account to another", ["asset"], "From account", ["asset"], "To account"),
    ];

    public static readonly string[] AccountTypes = ["asset", "liability", "equity", "revenue", "expense"];

    /// <summary>The two lines of a quick entry: the "to" account is debited and the "from" account credited.</summary>
    public static (string Description, IReadOnlyList<JournalDraftLine> Lines, string? Error) Quick(string kind, AccountInfo? from, AccountInfo? to, decimal amount)
    {
        if (amount <= 0) return ("", [], "Enter a valid amount.");
        if (from is null || to is null) return ("", [], "Select both accounts.");
        if (from.Id == to.Id) return ("", [], "The two accounts must be different.");
        var amt = amount.ToString("0.##");
        var description = kind switch
        {
            "capital" => $"Capital investment of {amt}",
            "income" => $"Income - {from.Name} - {amt}",
            "expense" => $"Expense - {to.Name} - {amt}",
            _ => $"Transfer - {from.Name} to {to.Name} - {amt}",
        };
        return (description, [new(to.Id, null, amount, 0), new(from.Id, null, 0, amount)], null);
    }

    /// <summary>Entries need a description, at least two lines with an account and one side filled, and equal debits and credits.</summary>
    public static string? Validate(string description, IReadOnlyList<JournalDraftLine> lines)
    {
        if (string.IsNullOrWhiteSpace(description)) return "A description is required.";
        var used = lines.Where(l => l.AccountId.Length > 0 && (l.Debit > 0 || l.Credit > 0)).ToList();
        if (used.Count < 2) return "At least two lines are needed.";
        if (used.Any(l => l.Debit < 0 || l.Credit < 0 || (l.Debit > 0 && l.Credit > 0))) return "A line is either a debit or a credit, not both.";
        if (Math.Abs(used.Sum(l => l.Debit) - used.Sum(l => l.Credit)) >= 0.01m) return "Debits and credits must be equal.";
        return null;
    }

    public static async Task<BookResult> PostEntryAsync(SupabaseApi api, string organizationId, DateOnly date, string description, string? reference,
        IReadOnlyList<JournalDraftLine> lines, CancellationToken ct = default)
    {
        if (Validate(description, lines) is { } problem) return new(false, problem);
        var used = lines.Where(l => l.AccountId.Length > 0 && (l.Debit > 0 || l.Credit > 0)).ToList();

        for (var attempt = 0; attempt < 3; attempt++)
        {
            // The next number after the highest JE-n so far (entries posted by the app itself use another prefix).
            var latest = await api.SelectAsync("journal_entries", $"select=entry_number&organization_id=eq.{organizationId}&entry_number=like.JE-*&order=entry_number.desc&limit=1", ct);
            if (!latest.Ok) return new(false, Describe(latest, "Could not post the entry."));
            var next = 1;
            if (latest.Body is { ValueKind: JsonValueKind.Array } a && a.GetArrayLength() > 0 &&
                int.TryParse(a[0].GetProperty("entry_number").GetString()?[3..], out var n)) next = n + 1;
            var number = $"JE-{next + attempt:D5}";

            var id = Guid.NewGuid().ToString();
            var header = await api.InsertAsync("journal_entries", new
            {
                id, organization_id = organizationId, entry_number = number, entry_date = date.ToString("yyyy-MM-dd"),
                description = description.Trim(), reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
                status = "posted", created_by = api.Session?.UserId,
            }, ct);
            if (header.Status == 409) continue; // someone used that number first
            if (!header.Ok) return new(false, Describe(header, "Could not post the entry."));

            var added = await api.InsertAsync("journal_entry_lines",
                used.Select(l => new { journal_entry_id = id, account_id = l.AccountId, description = string.IsNullOrWhiteSpace(l.Description) ? null : l.Description.Trim(), debit = l.Debit, credit = l.Credit }).ToList(), ct);
            if (!added.Ok)
            {
                await api.DeleteAsync("journal_entries", $"id=eq.{id}", ct); // don't leave an empty entry behind
                return new(false, Describe(added, "Could not post the entry."));
            }
            return new(true, null, number);
        }
        return new(false, "Could not get a free entry number. Try again.");
    }

    public static async Task<BookResult> SaveAccountAsync(SupabaseApi api, string organizationId, string? id, string code, string name, string type, string? description, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name)) return new(false, "Code and name are required.");
        if (!AccountTypes.Contains(type)) return new(false, "Choose what kind of account this is.");
        var desc = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (id is null)
        {
            var created = await api.InsertAsync("accounts", new { organization_id = organizationId, code = code.Trim(), name = name.Trim(), type, description = desc }, ct);
            return created.Ok ? new(true) : new(false, Describe(created, "Could not create the account."));
        }
        var updated = await api.PatchAsync("accounts", $"id=eq.{id}&organization_id=eq.{organizationId}", new { code = code.Trim(), name = name.Trim(), type, description = desc }, ct);
        if (!updated.Ok) return new(false, Describe(updated, "Could not save the account."));
        return updated.Body is { ValueKind: JsonValueKind.Array } b && b.GetArrayLength() == 0 ? new(false, "That account is gone or you aren't allowed to change it.") : new(true);
    }

    public static async Task<BookResult> SetAccountActiveAsync(SupabaseApi api, string organizationId, string id, bool active, CancellationToken ct = default)
    {
        var r = await api.PatchAsync("accounts", $"id=eq.{id}&organization_id=eq.{organizationId}", new { is_active = active }, ct);
        if (!r.Ok) return new(false, Describe(r, "Could not change the account."));
        return r.Body is { ValueKind: JsonValueKind.Array } a && a.GetArrayLength() == 0 ? new(false, "That account is gone or you aren't allowed to change it.") : new(true);
    }

    /// <summary>Creates the standard set of accounts for a lab that has none yet.</summary>
    public static async Task<BookResult> SeedDefaultAccountsAsync(SupabaseApi api, string organizationId, CancellationToken ct = default)
    {
        var r = await api.RpcAsync("seed_default_accounts", new { org_id = organizationId }, ct);
        return r.Ok ? new(true) : new(false, Describe(r, "Could not create the default accounts."));
    }

    private static string Describe(ApiResult r, string fallback) =>
        r.NetworkFailure ? "This needs an internet connection."
        : r.ErrorCode == "23505" ? "That code or number is already used."
        : r.Status is 401 or 403 ? "Your account isn't allowed to change the books."
        : r.ErrorMessage ?? fallback;
}
