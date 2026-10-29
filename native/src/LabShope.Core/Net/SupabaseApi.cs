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

    /// <summary>
    /// Raised whenever the login is renewed. The server hands out a new refresh token each time and only honours the newest,
    /// so whoever stores the login must save every one of these, not just the first.
    /// </summary>
    public event Action<AuthSession>? SessionRenewed;

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
        if (result.Ok) { Session = ParseSession(result.Body!.Value); SessionRenewed?.Invoke(Session); }
        return (result.Ok ? Session : null, result);
    }

    /// <summary>Gets a fresh access token. Returns false when the refresh token is no longer valid.</summary>
    public async Task<bool> RefreshAsync(CancellationToken ct = default)
    {
        if (Session is null) return false;
        var result = await SendAsync(HttpMethod.Post, "/auth/v1/token?grant_type=refresh_token",
            JsonSerializer.Serialize(new { refresh_token = Session.RefreshToken }), authenticated: false, ct);
        if (!result.Ok) return false;
        Session = ParseSession(result.Body!.Value);
        SessionRenewed?.Invoke(Session);
        return true;
    }

    /// <summary>Calls one of the website's server functions (such as send-email) with this person's login.</summary>
    public Task<ApiResult> FunctionAsync(string name, object body, CancellationToken ct = default) =>
        WithRefreshAsync(() => SendAsync(HttpMethod.Post, $"/functions/v1/{name}", JsonSerializer.Serialize(body), true, ct), ct);

    /// <summary>Reads every row of a query by paging (the server returns at most a page at a time). Throws nothing; returns the failure instead.</summary>
    public async Task<(List<JsonElement> Rows, ApiResult? Failure)> SelectAllAsync(string table, string query, int pageSize = 1000, int maxRows = 50_000, CancellationToken ct = default)
    {
        var rows = new List<JsonElement>();
        for (var offset = 0; offset < maxRows; offset += pageSize)
        {
            var result = await SelectAsync(table, $"{query}&limit={pageSize}&offset={offset}", ct);
            if (!result.Ok) return (rows, result);
            var page = result.Body is { ValueKind: JsonValueKind.Array } arr ? arr.EnumerateArray().ToList() : [];
            rows.AddRange(page);
            if (page.Count < pageSize) break;
        }
        return (rows, null);
    }

    /// <summary>Downloads a public file (such as the lab's logo). Returns null on any failure or when it is not an image or too large.</summary>
    public async Task<(byte[] Bytes, string ContentType)?> DownloadImageAsync(string url, int maxBytes = 600_000, CancellationToken ct = default)
    {
        try
        {
            using var response = await _http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode) return null;
            var type = response.Content.Headers.ContentType?.MediaType ?? "";
            if (!type.StartsWith("image/")) return null;
            var bytes = await response.Content.ReadAsByteArrayAsync(ct);
            return bytes.Length is > 0 && bytes.Length <= maxBytes ? (bytes, type) : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
        {
            if (ct.IsCancellationRequested) throw;
            return null;
        }
    }

    public Task<ApiResult> SelectAsync(string table, string query, CancellationToken ct = default) =>
        WithRefreshAsync(() => SendAsync(HttpMethod.Get, $"/rest/v1/{table}?{query}", null, true, ct), ct);

    /// <summary>
    /// Updates matching rows. Asks for the changed rows back, so "nothing matched" (wrong id, or not allowed by the
    /// database's row rules) can be told apart from success: the result body is an empty list.
    /// </summary>
    public Task<ApiResult> PatchAsync(string table, string query, object body, CancellationToken ct = default) =>
        WithRefreshAsync(() => SendAsync(new HttpMethod("PATCH"), $"/rest/v1/{table}?{query}", JsonSerializer.Serialize(body), true, ct, "return=representation"), ct);

    /// <summary>Adds a row to a table.</summary>
    public Task<ApiResult> InsertAsync(string table, object row, CancellationToken ct = default) =>
        WithRefreshAsync(() => SendAsync(HttpMethod.Post, $"/rest/v1/{table}", JsonSerializer.Serialize(row), true, ct), ct);

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
