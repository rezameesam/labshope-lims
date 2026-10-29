using System.Net;
using LabShope.Core.Net;

namespace LabShope.Core.Tests;

public class TokenRefreshTests
{
    private sealed class SlowServer : HttpMessageHandler
    {
        public int Refreshes;
        public List<string> TokensSeen { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (request.RequestUri!.Query.Contains("grant_type=refresh_token"))
            {
                var n = Interlocked.Increment(ref Refreshes);
                await Task.Delay(100, ct); // slow enough for the other callers to arrive meanwhile
                return Json("{\"access_token\":\"access-" + n + "\",\"refresh_token\":\"refresh-" + n + "\",\"expires_in\":3600,\"user\":{\"id\":\"u1\",\"email\":\"a@b.c\"}}");
            }
            lock (TokensSeen) TokensSeen.Add(request.Headers.Authorization!.Parameter!);
            return Json("[]");
        }

        private static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };
    }

    [Fact]
    public async Task ManyCallsAtTheMomentTheLoginExpiresRenewItOnlyOnce()
    {
        var server = new SlowServer();
        var api = new SupabaseApi(new HttpClient(server), "https://x.supabase.co", "anon")
        {
            Session = new AuthSession("old-access", "refresh-0", DateTimeOffset.UtcNow.AddSeconds(5), "u1", null), // about to expire
        };

        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => api.SelectAsync("patients", "select=id")));

        Assert.Equal(1, server.Refreshes); // a second renewal with the used-up token would fail and could sign everyone out
        Assert.Equal("refresh-1", api.Session!.RefreshToken);
        Assert.All(server.TokensSeen, t => Assert.Equal("access-1", t)); // and every call used the new one
    }
}
