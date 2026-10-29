using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace LabShope.Core.Net;

public sealed record AuthSession(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, string UserId, string? Email);

/// <summary>Talks to a Supabase project over plain HTTPS (auth + PostgREST). No SDK, easy to test.</summary>
public sealed class SupabaseApi
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private readonly string _anonKey;

    public AuthSession? Session { get; set; }

    public SupabaseApi(HttpClient http, string baseUrl, string anonKey)
    {
        _http = http;
        _baseUrl = baseUrl.TrimEnd('/');
        _anonKey = anonKey;
    }

    public async Task<(AuthSession? Session, ApiResult Result)> SignInAsync(string email, string password, CancellationToken ct = default)
    {
        var result = await SendAsync(HttpMethod.Post, "/auth/v1/token?grant_type=password",
            JsonSerializer.Serialize(new { email, password }), authenticated: false, ct);
        return (result.Ok ? Session = ParseSession(result.Body!.Value) : null, result);
    }

    /// <summary>Gets a fresh access token. Returns false when the refresh token is no longer valid.</summary>
    public async Task<bool> RefreshAsync(CancellationToken ct = default)
    {
        if (Session is null) return false;
        var result = await SendAsync(HttpMethod.Post, "/auth/v1/token?grant_type=refresh_token",
            JsonSerializer.Serialize(new { refresh_token = Session.RefreshToken }), authenticated: false, ct);
        if (!result.Ok) return false;
        Session = ParseSession(result.Body!.Value);
        return true;
    }

    public Task<ApiResult> SelectAsync(string table, string query, CancellationToken ct = default) =>
        WithRefreshAsync(() => SendAsync(HttpMethod.Get, $"/rest/v1/{table}?{query}", null, true, ct), ct);

    /// <summary>
    /// Updates matching rows. Asks for the changed rows back, so "nothing matched" (wrong id, or not allowed by the
    /// database's row rules) can be told apart from success: the result body is an empty list.
    /// </summary>
    public Task<ApiResult> PatchAsync(string table, string query, object body, CancellationToken ct = default) =>
        WithRefreshAsync(() => SendAsync(new HttpMethod("PATCH"), $"/rest/v1/{table}?{query}", JsonSerializer.Serialize(body), true, ct, "return=representation"), ct);

    public Task<ApiResult> RpcAsync(string function, object args, CancellationToken ct = default) =>
        WithRefreshAsync(() => SendAsync(HttpMethod.Post, $"/rest/v1/rpc/{function}", JsonSerializer.Serialize(args), true, ct), ct);

    /// <summary>One automatic retry with a refreshed token when the access token has expired.</summary>
    private async Task<ApiResult> WithRefreshAsync(Func<Task<ApiResult>> call, CancellationToken ct)
    {
        if (Session is not null && Session.ExpiresAt - DateTimeOffset.UtcNow < TimeSpan.FromSeconds(30))
            await RefreshAsync(ct);

        var result = await call();
        if (ErrorClassifier.Classify(result) == ErrorKind.Auth && await RefreshAsync(ct))
            result = await call();
        return result;
    }

    private async Task<ApiResult> SendAsync(HttpMethod method, string path, string? json, bool authenticated, CancellationToken ct, string? prefer = null)
    {
        using var request = new HttpRequestMessage(method, _baseUrl + path);
        request.Headers.Add("apikey", _anonKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authenticated && Session is not null ? Session.AccessToken : _anonKey);
        if (prefer is not null) request.Headers.Add("Prefer", prefer);
        if (json is not null) request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        try
        {
            using var response = await _http.SendAsync(request, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            JsonElement? body = null;
            if (text.Length > 0)
            {
                try { body = JsonDocument.Parse(text).RootElement.Clone(); } catch (JsonException) { }
            }

            if (response.IsSuccessStatusCode) return new ApiResult((int)response.StatusCode, body, null, null);

            string? code = null, message = text;
            if (body is { ValueKind: JsonValueKind.Object } obj)
            {
                code = Str(obj, "code") ?? Str(obj, "error_code");
                message = Str(obj, "message") ?? Str(obj, "msg") ?? Str(obj, "error_description") ?? text;
            }
            return new ApiResult((int)response.StatusCode, body, code, message);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
        {
            if (ct.IsCancellationRequested) throw;
            return new ApiResult(0, null, null, ex.Message, NetworkFailure: true);
        }
    }

    private static string? Str(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static AuthSession ParseSession(JsonElement body) => new(
        body.GetProperty("access_token").GetString()!,
        body.GetProperty("refresh_token").GetString()!,
        DateTimeOffset.UtcNow.AddSeconds(body.GetProperty("expires_in").GetInt32()),
        body.GetProperty("user").GetProperty("id").GetString()!,
        body.GetProperty("user").TryGetProperty("email", out var e) ? e.GetString() : null);
}
