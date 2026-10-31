using System.Net;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class BrandingTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    public BrandingTests() => _store = new LocalStore(_path);

    private const string Context = """
        {"organization":{"id":"o1","slug":"sunrise","display_name":"Sunrise Diagnostics","primary_phone":"+911111","primary_email":"org@sunrise.example","logo_url":"https://cdn.example/logo.png"},
         "primary_lab":{"id":"l1","name":"Sunrise Main Lab","address":"12 Park Road","city":"Pune","state":"MH","pincode":"411001","phone":"+912222","email":"lab@sunrise.example","logo_url":null},
         "settings":{"report_tagline":"Care you can trust","report_footer_note":"Not valid for medico-legal use.","organization_website":"https://sunrise.example"}}
        """;

    // A handler that serves the lab lookup as JSON and the logo as a PNG.
    private sealed class Handler(Action? onLogo = null) : HttpMessageHandler
    {
        public int LogoDownloads;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (request.RequestUri!.Host == "cdn.example")
            {
                LogoDownloads++; onLogo?.Invoke();
                var content = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47, 1, 2, 3]);
                content.Headers.ContentType = new("image/png");
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Context, System.Text.Encoding.UTF8, "application/json") });
        }
    }

    private SyncEngine Engine(HttpMessageHandler h) =>
        new(_store, new SupabaseApi(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) }, "o1");

    [Fact]
    public void ReadsNameAddressContactAndReportWordingFromTheLabLookup()
    {
        var b = Branding.FromContext(Context, "fallback")!;

        Assert.Equal(("Sunrise Diagnostics", "Care you can trust", "Not valid for medico-legal use."), (b.Name, b.ReportTagline, b.ReportFooterNote));
        Assert.Equal(["12 Park Road", "Pune, MH", "411001"], b.AddressLines);
        Assert.Equal(("+912222", "lab@sunrise.example", "https://cdn.example/logo.png"), (b.Phone, b.Email, b.LogoUrl)); // the lab's own phone/email win over the organisation's
    }

    [Fact]
    public void FallsBackToDefaultsWhenTheLabHasNotSetAnything()
    {
        var b = Branding.FromContext("""{"organization":{"display_name":"Tiny Lab"},"primary_lab":null,"settings":{}}""", "x")!;
        Assert.Equal(("Tiny Lab", Branding.DefaultReportTagline, Branding.DefaultFooterNote), (b.Name, b.ReportTagline, b.ReportFooterNote));
        Assert.Empty(b.AddressLines);
        Assert.Null(Branding.FromContext("not json", "x"));
    }

    [Fact]
    public async Task StoresTheBrandingAndTheLogoForOfflinePrintingAndOnlyRedownloadsAChangedLogo()
    {
        var handler = new Handler();
        var engine = Engine(handler);

        Assert.True(await engine.PullBrandingAsync("sunrise", "Sunrise", force: true));
        var stored = _store.GetBranding("Sunrise");
        Assert.Equal("Sunrise Diagnostics", stored.Name);
        Assert.StartsWith("data:image/png;base64,", stored.LogoDataUri);
        Assert.Equal(1, handler.LogoDownloads);

        Assert.False(await engine.PullBrandingAsync("sunrise", "Sunrise"));            // too soon: skipped
        Assert.True(await engine.PullBrandingAsync("sunrise", "Sunrise", force: true));
        Assert.Equal(1, handler.LogoDownloads);                                          // same logo address: not downloaded again
    }

    [Fact]
    public void WithNothingSyncedYetThePrintedPagesStillGetTheLabName() =>
        Assert.Equal("My Lab", _store.GetBranding("My Lab").Name);

    [Fact]
    public void ReportOptionsTurnTheHeaderFooterAndWatermarkOffIndependently()
    {
        var b = Branding.FromContext(Context, "x")! with { LogoDataUri = "data:image/png;base64,AAAA" };
        var data = new ReportData("Sunrise", "Asha", "IRM-1", "female", "30 y", "+91", "2026-10-29", [new ReportSection("HB", [new ReportLine("HB", "12", "g/dL", "13 - 17", true)], false)], Branding: b, FooterText: "Thank you for choosing us");

        var all = ReportHtml.Build(data);
        Assert.Contains("Care you can trust", all);                    // header
        Assert.Contains("Thank you for choosing us", all);             // footer
        Assert.Contains("opacity:.07", all);                           // watermark
        Assert.Contains("Asha", all);

        var none = ReportHtml.Build(data, new ReportOptions(false, false, false));
        Assert.DoesNotContain("Care you can trust", none);
        Assert.DoesNotContain("Not valid for medico-legal use.", none);
        Assert.DoesNotContain("Thank you for choosing us", none);
        Assert.DoesNotContain("<img", none);
        Assert.Contains("Asha", none);                                  // the patient and results always print
        Assert.Contains("13 - 17", none);

        Assert.DoesNotContain("opacity:.07", ReportHtml.Build(data, new ReportOptions(true, true, false)));
        Assert.DoesNotContain("Thank you for choosing us", ReportHtml.Build(data, new ReportOptions(true, false, true)));
    }

    [Fact]
    public void ReceiptsAndReportsCarryTheLabsOwnHeaderAndFooterWording()
    {
        var b = Branding.FromContext(Context, "x")! with { LogoDataUri = "data:image/png;base64,AAAA" };

        var receipt = ReceiptHtml.Build(new Receipt("p1", "INV1", false, "Asha", 500m, 500m, 500m, 0m, "paid", "cash", "2026-10-29T04:00:00.000Z"), "Sunrise", b);
        Assert.Contains("12 Park Road, Pune, MH, 411001", receipt);
        Assert.Contains("Phone: +912222", receipt);
        Assert.Contains("data:image/png;base64,AAAA", receipt);

        var report = ReportHtml.Build(new ReportData("Sunrise", "Asha", "IRM-1", "female", "30 y", "+91", "2026-10-29", [new ReportSection("HB", [new ReportLine("HB", "12", "g/dL", "13 - 17", true)], false)], Branding: b));
        Assert.Contains("Care you can trust", report);
        Assert.Contains("Not valid for medico-legal use.", report);
        Assert.Contains("Phone: +912222", report);
        Assert.Contains("<img", report);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
