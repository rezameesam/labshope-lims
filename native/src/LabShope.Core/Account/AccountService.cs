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
    private IReadOnlyList<string> _roles = [];

    public AccountService(SupabaseApi api, string settingsPath)
    {
        _api = api;
        _settingsPath = settingsPath;
        _api.SessionRenewed += OnSessionRenewed;
    }

    private sealed record Saved(string Slug, string OrganizationId, string OrganizationName, string? LabId, string RefreshToken, string UserId, string? Email, List<string>? Roles = null);

    /// <summary>
    /// Emails a password reset link. The website's reset page only works on the lab's own address (reset links are tied
    /// to one lab), and the app can only know that address for an email that signed in on this computer before.
    /// </summary>
    public async Task<LoginResult> ForgotPasswordAsync(string email, CancellationToken ct = default)
    {
        email = email.Trim();
        if (!email.Contains('@') || email.Length < 5) return new(false, "Enter your email address above first.");

        var saved = Load();
        if (saved is null || !string.Equals(saved.Email, email, StringComparison.OrdinalIgnoreCase))
            return new(false, "To reset the password, open your lab's website (the address you were given, like yourlab.labshope.com), choose Staff sign in and then Forgot password. Then come back here and sign in.");

        var result = await _api.RequestPasswordResetAsync(email, $"https://{saved.Slug}.labshope.com/staff/reset-password", ct);
        if (result.NetworkFailure) return new(false, "Can't reach the server. Check the internet connection.");
        if (!result.Ok && result.Status == 429) return new(false, "Too many requests. Please wait a minute and try again.");
        if (!result.Ok) return new(false, result.ErrorMessage ?? "The reset email could not be sent.");
        return new(true, null);
    }

    /// <summary>
    /// Signs in with just email and password; the lab is found from the account (customers sign up on the
    /// website, they never need to know a lab name). If the account belongs to several labs the caller gets
    /// the list to choose from and then calls <see cref="ChooseAsync"/>.
    /// </summary>
    public async Task<LoginResult> SignInAsync(string email, string password, CancellationToken ct = default)
    {
        if (email.Trim().Length == 0 || password.Length == 0) return new(false, "Enter your email and password.");

        var (session, signIn) = await _api.SignInAsync(email.Trim(), password, ct);
        if (signIn.NetworkFailure) return new(false, "Can't reach the server. Check the internet connection. (The first sign-in on a computer needs internet.)");
        if (session is null)
        {
            if (signIn.ErrorCode == "email_not_confirmed") return new(false, "This email address has not been confirmed yet. Open the confirmation email we sent, then sign in.");
            if (signIn.Status == 429 || signIn.ErrorCode == "over_request_rate_limit") return new(false, "Too many attempts. Please wait a minute and try again.");
            if (signIn.Status >= 500) return new(false, "The server had a problem. Please try again in a moment.");
            return new(false, signIn.Status is 400 or 401 or 422 ? "Wrong email or password." : signIn.ErrorMessage ?? "Sign-in failed.");
        }

        // The same rules the web login applies: a staff role, and (for staff) an active employee record.
        var rolesResult = await _api.SelectAsync("user_roles", $"select=role&user_id=eq.{session.UserId}", ct);
        var roles = rolesResult.Body is { ValueKind: JsonValueKind.Array } roleRows
            ? roleRows.EnumerateArray().Select(r => r.GetProperty("role").GetString()!).ToList()
            : [];
        if (!roles.Any(r => r is "admin" or "employee" or "collector"))
        {
            _api.Session = null;
            return new(false, "Your account does not have staff access.");
        }
        _roles = roles;

        var employee = await _api.SelectAsync("employees", $"select=organization_id,is_active,two_factor_email_enabled&user_id=eq.{session.UserId}&limit=1", ct);
        string? employeeOrg = null;
        if (employee.Body is { ValueKind: JsonValueKind.Array } empRows && empRows.GetArrayLength() > 0)
        {
            var row = empRows[0];
            if (row.TryGetProperty("is_active", out var active) && active.ValueKind == JsonValueKind.False)
            {
                _api.Session = null;
                return new(false, "Your staff account is inactive. Ask your lab admin.");
            }
            if (row.TryGetProperty("two_factor_email_enabled", out var tf) && tf.ValueKind == JsonValueKind.True)
            {
                _api.Session = null;
                return new(false, "This account uses email two-step verification, which the desktop app doesn't support yet. Ask your admin to turn it off for this account, or use the website.");
            }
            employeeOrg = row.TryGetProperty("organization_id", out var o) && o.ValueKind == JsonValueKind.String ? o.GetString() : null;
        }

        // Staff go to their own lab. Owners and platform admins without an employee record use their memberships.
        var memberships = await _api.SelectAsync("organization_users", $"select=organization_id&user_id=eq.{session.UserId}&is_active=eq.true", ct);
        var orgIds = memberships.Body is { ValueKind: JsonValueKind.Array } rows
            ? rows.EnumerateArray().Select(r => r.GetProperty("organization_id").GetString()!).Distinct().ToList()
            : [];
        if (employeeOrg is not null) orgIds = orgIds.Where(id => id == employeeOrg).ToList();

        if (!memberships.Ok || orgIds.Count == 0)
        {
            _api.Session = null;
            return new(false, "This account isn't linked to a lab yet. Finish setting up your lab on the website first.");
        }

        var orgs = await _api.SelectAsync("organizations", $"select=id,slug,display_name,status&id=in.({string.Join(",", orgIds)})", ct);
        var choices = new List<Workspace>();
        if (orgs.Body is { ValueKind: JsonValueKind.Array } list)
        {
            foreach (var o in list.EnumerateArray())
            {
                var status = o.GetProperty("status").GetString();
                if (status is not ("trial" or "active")) continue;
                var id = o.GetProperty("id").GetString()!;
                var slug = o.GetProperty("slug").GetString()!;
                var name = o.TryGetProperty("display_name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString()! : slug;
                choices.Add(new Workspace(slug, id, name, null, roles));
            }
        }

        if (choices.Count == 0) { _api.Session = null; return new(false, "Your lab's subscription isn't active. Please contact support."); }
        if (choices.Count > 1) return new(true, Choices: choices);
        return await ChooseAsync(choices[0], ct);
    }

    /// <summary>Finishes sign-in for the chosen lab: finds its main lab and remembers the login.</summary>
    public async Task<LoginResult> ChooseAsync(Workspace choice, CancellationToken ct = default)
    {
        if (_api.Session is null) return new(false, "Please sign in again.");

        var labs = await _api.SelectAsync("labs", $"select=id&organization_id=eq.{choice.OrganizationId}&is_active=eq.true&order=created_at.asc&limit=1", ct);
        string? labId = labs.Body is { ValueKind: JsonValueKind.Array } arr && arr.GetArrayLength() > 0 ? arr[0].GetProperty("id").GetString() : null;

        var workspace = choice with { LabId = labId, Roles = _roles };
        Save(new Saved(workspace.Slug, workspace.OrganizationId, workspace.OrganizationName, labId, _api.Session.RefreshToken, _api.Session.UserId, _api.Session.Email, _roles.ToList()));
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

        var workspace = new Workspace(saved.Slug, saved.OrganizationId, saved.OrganizationName, saved.LabId, saved.Roles);
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

    /// <summary>Keeps the saved login in step with the newest refresh token (the older ones stop working).</summary>
    private void OnSessionRenewed(AuthSession session)
    {
        var saved = Load();
        if (saved is not null && saved.UserId == session.UserId && saved.RefreshToken != session.RefreshToken)
            Save(saved with { RefreshToken = session.RefreshToken });
    }

    public string? SavedEmail => Load()?.Email;
    public string? SavedUserId => Load()?.UserId;

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
        RestrictToOwner(tmp);
        File.Move(tmp, _settingsPath, overwrite: true);
    }

    /// <summary>On macOS and Linux the saved sign-in is readable by its owner only (Windows keeps it in the user's own profile folder).</summary>
    private static void RestrictToOwner(string file)
    {
        if (OperatingSystem.IsWindows()) return;
#if NET7_0_OR_GREATER
        File.SetUnixFileMode(file, UnixFileMode.UserRead | UnixFileMode.UserWrite);
#else
        try { using var chmod = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("chmod", $"600 \"{file}\"") { UseShellExecute = false, CreateNoWindow = true }); chmod?.WaitForExit(2000); }
        catch (Exception) { /* best effort */ }
#endif
    }
}
