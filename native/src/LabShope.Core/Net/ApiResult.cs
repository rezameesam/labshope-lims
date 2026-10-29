using System.Text.Json;

namespace LabShope.Core.Net;

public enum ErrorKind { Network, Auth, Transient, Permanent }

/// <summary>The outcome of one server call. Never throws for HTTP or network problems.</summary>
public sealed record ApiResult(int Status, JsonElement? Body, string? ErrorCode, string? ErrorMessage, bool NetworkFailure = false)
{
    public bool Ok => !NetworkFailure && Status is >= 200 and < 300;
}

public static class ErrorClassifier
{
    // PGRST202: the function isn't on the server yet (the app is newer than the database). Keep the work queued
    // until the server is updated instead of failing it.
    private static readonly HashSet<string> TransientCodes = ["40001", "40P01", "57014", "57P03", "PGRST000", "PGRST001", "PGRST002", "PGRST003", "PGRST202"];
    private static readonly HashSet<string> AuthCodes = ["PGRST301", "PGRST302", "28000", "28P01"];

    /// <summary>
    /// Network, auth and transient errors keep a visit queued for another try; permanent errors
    /// (validation, permissions) move it to "failed" so staff can review it instead of retrying forever.
    /// </summary>
    public static ErrorKind Classify(ApiResult result)
    {
        var code = result.ErrorCode ?? "";
        var message = result.ErrorMessage ?? "";

        if (result.NetworkFailure) return ErrorKind.Network;
        if (AuthCodes.Contains(code) || result.Status == 401 ||
            System.Text.RegularExpressions.Regex.IsMatch(message, "jwt (expired|invalid)|not authenticated", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            return ErrorKind.Auth;
        if (TransientCodes.Contains(code) || code.StartsWith("08") || code.StartsWith("53") || result.Status >= 500)
            return ErrorKind.Transient;
        return ErrorKind.Permanent;
    }
}
