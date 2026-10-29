using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Visits;

public sealed record SubscriptionInfo(string Status, string PlanCode, DateTimeOffset? TrialEndsAt, DateTimeOffset? PlanExpiresAt, bool IsComplimentary, DateTimeOffset? ComplimentaryUntil);

public enum NoticeLevel { Info, Warning, Danger }

public sealed record SubscriptionNotice(NoticeLevel Level, string Text);

/// <summary>
/// Tells staff about the lab's subscription before it surprises them: trials end and suspend automatically, and a suspended lab can no longer sign in.
/// The details are cached on this PC so the notice also shows offline.
/// </summary>
public static class SubscriptionService
{
    private const string Key = "subscription";
    private const string SyncedKey = "subscription_synced_at";
    private static readonly TimeSpan MaxAge = TimeSpan.FromHours(6);

    public static async Task<bool> RefreshAsync(SupabaseApi api, LocalStore store, string organizationId, bool force = false, CancellationToken ct = default)
    {
        if (!force && long.TryParse(store.GetMeta(SyncedKey), out var last) && DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(last) < MaxAge) return false;

        var result = await api.SelectAsync("organizations", $"select=status,plan_code,trial_ends_at,plan_expires_at,is_complimentary,complimentary_until&id=eq.{organizationId}&limit=1", ct);
        if (!result.Ok) throw new Sync.SyncException(result);
        if (result.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0) return false;

        var r = rows[0];
        string? S(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        DateTimeOffset? D(string n) => DateTimeOffset.TryParse(S(n), out var d) ? d : null;
        var info = new SubscriptionInfo(S("status") ?? "active", S("plan_code") ?? "starter", D("trial_ends_at"), D("plan_expires_at"),
            r.TryGetProperty("is_complimentary", out var c) && c.ValueKind == JsonValueKind.True, D("complimentary_until"));

        store.SetMeta(Key, JsonSerializer.Serialize(info));
        store.SetMeta(SyncedKey, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
        return true;
    }

    public static SubscriptionInfo? Cached(LocalStore store)
    {
        try { return store.GetMeta(Key) is { } json ? JsonSerializer.Deserialize<SubscriptionInfo>(json) : null; }
        catch (JsonException) { return null; }
    }

    /// <summary>The message to show, or null when there is nothing to say.</summary>
    public static SubscriptionNotice? Notice(SubscriptionInfo? info, DateTimeOffset now)
    {
        if (info is null) return null;
        if (info.Status is "suspended" or "cancelled" or "expired")
            return new(NoticeLevel.Danger, "Your LabShope subscription is not active. You can keep working here, but staff won't be able to sign in on other computers until it is renewed. Please contact LabShope.");

        // A complimentary lab (free of charge for a period) is told only when that period is about to end.
        if (info.IsComplimentary && info.ComplimentaryUntil is { } until) return Countdown(until, now, "Your complimentary access");
        if (info.IsComplimentary) return null;

        if (info.Status == "trial" && info.TrialEndsAt is { } trial) return Countdown(trial, now, "Your free trial", always: true);
        if (info.PlanExpiresAt is { } expires) return Countdown(expires, now, "Your subscription");
        return null;
    }

    private static SubscriptionNotice? Countdown(DateTimeOffset end, DateTimeOffset now, string what, bool always = false)
    {
        var days = (int)Math.Ceiling((end - now).TotalDays);
        if (days < 0) return new(NoticeLevel.Danger, $"{what} has ended. Please renew with LabShope to avoid being locked out.");
        if (days <= 3) return new(NoticeLevel.Danger, $"{what} ends {(days == 0 ? "today" : days == 1 ? "tomorrow" : $"in {days} days")}. Renew with LabShope to keep working without interruption.");
        if (days <= 14) return new(NoticeLevel.Warning, $"{what} ends in {days} days ({end.ToLocalTime():d MMM yyyy}).");
        return always ? new(NoticeLevel.Info, $"{what} runs until {end.ToLocalTime():d MMM yyyy}.") : null;
    }
}
