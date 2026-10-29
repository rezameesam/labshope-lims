namespace LabShope.Core.Account;

/// <summary>The lab this computer is signed in to.</summary>
public sealed record Workspace(string Slug, string OrganizationId, string OrganizationName, string? LabId);

public sealed record LoginResult(bool Ok, string? Error = null, Workspace? Workspace = null);
