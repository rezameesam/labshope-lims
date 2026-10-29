using System.Text.Json;
using LabShope.Core.Net;

namespace LabShope.Core.Account;

/// <summary>
/// Signs staff in directly with Supabase (email + password), picks the lab by name, and checks that
/// the person really belongs to that lab. The refresh token is remembered so the next start is instant
/// and works offline.
/// </summary>
public sealed class AccountService
{
    private readonly SupabaseApi _api;
    private readonly string _settingsPath;

    public AccountService(SupabaseApi api, string settingsPath)
    {
        _api = api;
        _settingsPath = settingsPath;
    }

    private sealed record Saved(string Slug, string OrganizationId, string OrganizationName, string? LabId, string RefreshToken, string UserId, string? Email);

    public async Task<LoginResult> SignInAsync(string labName, string email, string password, CancellationToken ct = default)
    {
        var slug = labName.Trim().ToLowerInvariant();
        if (slug.Length == 0) return new(false, "Enter your lab name.");
        if (email.Trim().Length == 0 || password.Length == 0) return new(false, "Enter your email and password.");

        // 1. Which lab is this? (public lookup, no sign-in needed)
        var context = await _api.RpcAsync("get_public_organization_context", new { _domain = (string?)null, _slug = slug }, ct);
        if (context.NetworkFailure) return new(false, "Can't reach the server. Check the internet connection.");
        if (!context.Ok) return new(false, "Could not look up that lab. Try again.");
        if (context.Body is not { ValueKind: JsonValueKind.Object } body || !body.TryGetProperty("organization", out var org) || org.ValueKind != JsonValueKind.Object)
            return new(false, $"No active lab named \"{slug}\".");

        var orgId = org.GetProperty("id").GetString()!;
        var orgName = org.TryGetProperty("display_name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString()! : slug;
        string? labId = body.TryGetProperty("primary_lab", out var lab) && lab.ValueKind == JsonValueKind.Object && lab.TryGetProperty("id", out var l) ? l.GetString() : null;

        // 2. Sign in.
        var (session, signIn) = await _api.SignInAsync(email.Trim(), password, ct);
        if (signIn.NetworkFailure) return new(false, "Can't reach the server. Check the internet connection.");
        if (session is null)
            return new(false, signIn.Status is 400 or 401 or 422 ? "Wrong email or password." : signIn.ErrorMessage ?? "Sign-in failed.");

        // 3. They must belong to this lab.
        var member = await _api.SelectAsync("organization_users", $"select=user_id&user_id=eq.{session.UserId}&organization_id=eq.{orgId}&limit=1", ct);
        if (!member.Ok || member.Body is not { ValueKind: JsonValueKind.Array } rows || rows.GetArrayLength() == 0)
        {
            _api.Session = null;
            return new(false, "This account doesn't have access to that lab.");
        }

        var workspace = new Workspace(slug, orgId, orgName, labId);
        Save(new Saved(slug, orgId, orgName, labId, session.RefreshToken, session.UserId, session.Email));
        return new(true, Workspace: workspace);
    }

    /// <summary>
    /// Signs back in from the saved login without asking for the password. Works offline: when the
    /// server can't be reached the saved lab is returned so the app still opens with local data.
    /// </summary>
    public async Task<(Workspace? Workspace, bool Online)> RestoreAsync(CancellationToken ct = default)
    {
        var saved = Load();
        if (saved is null) return (null, false);

        var workspace = new Workspace(saved.Slug, saved.OrganizationId, saved.OrganizationName, saved.LabId);
        _api.Session = new AuthSession("", saved.RefreshToken, DateTimeOffset.MinValue, saved.UserId, saved.Email);

        if (await _api.RefreshAsync(ct))
        {
            Save(saved with { RefreshToken = _api.Session!.RefreshToken });
            return (workspace, true);
        }

        // Refresh failed. If the server answered "no", the login is over; if we are just offline, carry on.
        var probe = await _api.RpcAsync("get_public_organization_context", new { _domain = (string?)null, _slug = saved.Slug }, ct);
        return probe.NetworkFailure ? (workspace, false) : (null, true);
    }

    public void SignOut()
    {
        _api.Session = null;
        if (File.Exists(_settingsPath)) File.Delete(_settingsPath);
    }

    public string? SavedEmail => Load()?.Email;

    private Saved? Load()
    {
        try { return File.Exists(_settingsPath) ? JsonSerializer.Deserialize<Saved>(File.ReadAllText(_settingsPath)) : null; }
        catch (Exception ex) when (ex is JsonException or IOException) { return null; }
    }

    private void Save(Saved saved)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
        var tmp = _settingsPath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(saved));
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(tmp, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        File.Move(tmp, _settingsPath, overwrite: true);
    }
}
