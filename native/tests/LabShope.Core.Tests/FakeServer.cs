using System.Net;
using System.Text;

namespace LabShope.Core.Tests;

/// <summary>A scripted Supabase: tests give it handlers and read back the requests it saw.</summary>
public sealed class FakeServer : HttpMessageHandler
{
    public List<(HttpMethod Method, string Url, string Body)> Requests { get; } = [];
    public Func<HttpRequestMessage, string, (HttpStatusCode, string)> Handler { get; set; } = (_, _) => (HttpStatusCode.OK, "[]");

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
        Requests.Add((request.Method, request.RequestUri!.ToString(), body));
        var (status, json) = Handler(request, body);
        return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    }
}

public sealed class OfflineServer : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
        throw new HttpRequestException("No such host is known");
}
