namespace LabShope.Core.Account;

/// <summary>The lab this computer is signed in to, and what the signed-in person may do there.</summary>
public sealed record Workspace(string Slug, string OrganizationId, string OrganizationName, string? LabId, IReadOnlyList<string>? Roles = null)
{
    public bool IsAdmin => Roles?.Contains("admin") == true;
}

/// <summary>
/// Ok with a Workspace: signed in. Ok with Choices: the account belongs to several labs, pick one.
/// </summary>
public sealed record LoginResult(bool Ok, string? Error = null, Workspace? Workspace = null, IReadOnlyList<Workspace>? Choices = null);
