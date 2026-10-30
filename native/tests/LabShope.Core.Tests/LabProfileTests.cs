using System.Net;
using System.Text.Json;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class LabProfileTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly LabProfileData Before = new("Sunrise Diagnostics", "9876543210", "lab@sunrise.in", "Quality care", "https://sunrise.in", "Trusted since 2010", "Computer generated.", null);

    [Fact]
    public async Task LoadsTheOrganizationRowAndTheFourSettings()
    {
        var server = new FakeServer
        {
            Handler = (r, _) => r.RequestUri!.AbsolutePath.EndsWith("organizations")
                ? (HttpStatusCode.OK, """[{"display_name":"Sunrise","primary_phone":"98","primary_email":"a@b.in","logo_url":"https://x/logo.png"}]""")
                : (HttpStatusCode.OK, """[{"setting_key":"branding_tagline","setting_value":"Hi"},{"setting_key":"report_footer_note","setting_value":"Note"}]"""),
        };
        var (profile, error) = await LabProfile.LoadAsync(Api(server), "org-1");
        Assert.Null(error);
        Assert.Equal(("Sunrise", "98", "a@b.in", "Hi", "", "", "Note", "https://x/logo.png"),
            (profile!.DisplayName, profile.Phone, profile.Email, profile.Tagline, profile.Website, profile.ReportTagline, profile.ReportFooterNote, profile.LogoUrl));
        Assert.Contains("id=eq.org-1", server.Requests[0].Url);
        Assert.Contains("organization_id=eq.org-1", server.Requests[1].Url);
        Assert.Contains("Lab profile".ToLower().Replace("lab profile", "internet"), (await LabProfile.LoadAsync(Api(new OfflineServer()), "org-1")).Error!);
    }

    [Fact]
    public async Task SavesOnlyWhatChanged()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"x"}]""") };
        var result = await LabProfile.SaveAsync(Api(server), "org-1", "user-1", Before, Before with { Phone = "9000000000", ReportFooterNote = "New note" });
        Assert.True(result.Ok, result.Error);
        Assert.Equal(2, server.Requests.Count);

        Assert.Equal("PATCH", server.Requests[0].Method.Method);
        Assert.Contains("/rest/v1/organizations?id=eq.org-1", server.Requests[0].Url);
        var org = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.Equal(("Sunrise Diagnostics", "9000000000"), (org.GetProperty("display_name").GetString(), org.GetProperty("primary_phone").GetString()));

        Assert.Contains("/rest/v1/organization_settings?on_conflict=organization_id,setting_key", server.Requests[1].Url);
        var settings = JsonDocument.Parse(server.Requests[1].Body).RootElement;
        Assert.Equal(1, settings.GetArrayLength()); // only the note changed
        Assert.Equal(("report_footer_note", "New note", "user-1"), (settings[0].GetProperty("setting_key").GetString(), settings[0].GetProperty("setting_value").GetString(), settings[0].GetProperty("updated_by").GetString()));
    }

    [Fact]
    public async Task NothingChangedSendsNothing()
    {
        var server = new FakeServer();
        Assert.True((await LabProfile.SaveAsync(Api(server), "org-1", "user-1", Before, Before)).Ok);
        Assert.Empty(server.Requests);
    }

    [Theory]
    [InlineData("", "a@b.in", "https://x.in", "name")]
    [InlineData("Lab", "not-an-email", "https://x.in", "email")]
    [InlineData("Lab", "a@b.in", "sunrise.in", "full address")]
    [InlineData("Lab", "a@b.in", "ftp://x.in", "http")]
    public async Task RefusesBadInputBeforeAskingTheServer(string name, string email, string website, string expected)
    {
        var server = new FakeServer();
        var result = await LabProfile.SaveAsync(Api(server), "org-1", null, Before, Before with { DisplayName = name, Email = email, Website = website });
        Assert.Contains(expected, result.Error, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task ReportsOfflineDeniedAndRefusedSaves()
    {
        var changed = Before with { Phone = "1" };
        Assert.Contains("internet", (await LabProfile.SaveAsync(Api(new OfflineServer()), "org-1", null, Before, changed)).Error);
        Assert.Contains("isn't allowed", (await LabProfile.SaveAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Forbidden, "{}") }), "org-1", null, Before, changed)).Error);
        Assert.Contains("did not accept", (await LabProfile.SaveAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") }), "org-1", null, Before, changed)).Error);
    }

    [Theory]
    [InlineData("logo.PNG", 1000, "image/png", null)]
    [InlineData("logo.svg", 1000, "image/svg+xml", null)]
    [InlineData("logo.gif", 1000, null, "JPG, PNG")]
    [InlineData("logo.png", 3 * 1024 * 1024, null, "2 MB")]
    [InlineData("logo.png", 0, null, "empty")]
    public void ChecksTheLogoFileLikeTheWebsite(string file, long size, string? type, string? error)
    {
        var (t, e) = LabProfile.CheckLogo(file, size);
        Assert.Equal(type, t);
        if (error is null) Assert.Null(e); else Assert.Contains(error, e);
    }

    [Fact]
    public async Task UploadsALogoThenPointsTheLabAtIt()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"x"}]""") };
        var (url, error) = await LabProfile.UploadLogoAsync(Api(server), "org-1", "My Logo.png", [1, 2, 3], () => new DateTimeOffset(2026, 10, 30, 0, 0, 0, TimeSpan.Zero));
        Assert.Null(error);
        Assert.Equal("https://x.supabase.co/storage/v1/object/public/organization-branding/org-1/logo-1793318400000.png", url);
        Assert.Equal("POST", server.Requests[0].Method.Method);
        Assert.EndsWith("/storage/v1/object/organization-branding/org-1/logo-1793318400000.png", server.Requests[0].Url);
        Assert.Equal("PATCH", server.Requests[1].Method.Method);
        Assert.Equal(url, JsonDocument.Parse(server.Requests[1].Body).RootElement.GetProperty("logo_url").GetString());

        var bad = new FakeServer();
        Assert.Contains("JPG, PNG", (await LabProfile.UploadLogoAsync(Api(bad), "org-1", "x.bmp", [1])).Error);
        Assert.Empty(bad.Requests);
    }
}
