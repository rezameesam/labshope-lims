using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class CatalogManageTests
{
    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static readonly Catalog Cat = new(
        [new CatalogTest("t1", "CBC", "CBC", 300m, null), new CatalogTest("t2", "LFT", "Liver Function Test", 450m, null)], [], [], [], []);

    private static DoctorInput Doc(string name = "Dr Rao", string commission = "10") => new(name, " Pathology ", "", "", "", commission, true, "");

    [Fact]
    public async Task AddsADoctorWithTheWebsitesFields()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        var result = await CatalogManage.AddDoctorAsync(Api(server), "org-1", new DoctorInput("  Dr Rao ", " Pathology ", "98765", "", "", "12.5", true, ""));
        Assert.True(result.Ok, result.Error);
        var call = server.Requests.Single();
        Assert.Equal("POST", call.Method.Method);
        Assert.EndsWith("/rest/v1/doctors", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("Dr Rao", "Pathology", 12.5m, "org-1", true), (body.GetProperty("name").GetString(), body.GetProperty("specialization").GetString(),
            body.GetProperty("commission_percentage").GetDecimal(), body.GetProperty("organization_id").GetString(), body.GetProperty("is_active").GetBoolean()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("email").ValueKind); // blank means none
    }

    [Theory]
    [InlineData("", "10", "name")]
    [InlineData("Dr X", "abc", "percentage")]
    [InlineData("Dr X", "101", "percentage")]
    [InlineData("Dr X", "-1", "percentage")]
    public async Task RefusesBadDoctorInputBeforeAskingTheServer(string name, string commission, string expected)
    {
        var server = new FakeServer();
        var result = await CatalogManage.AddDoctorAsync(Api(server), "org-1", Doc(name, commission));
        Assert.False(result.Ok);
        Assert.Contains(expected, result.Error, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task UpdatesADoctorForThatOrganizationOnlyAndReportsRefusal()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"d1"}]""") };
        Assert.True((await CatalogManage.UpdateDoctorAsync(Api(server), "org-1", "d1", Doc())).Ok);
        Assert.Contains("/rest/v1/doctors?id=eq.d1&organization_id=eq.org-1", server.Requests.Single().Url);

        var refused = await CatalogManage.UpdateDoctorAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") }), "org-1", "d1", Doc());
        Assert.False(refused.Ok);
        Assert.Contains("internet", (await CatalogManage.UpdateDoctorAsync(Api(new OfflineServer()), "org-1", "d1", Doc())).Error);
    }

    [Fact]
    public async Task ADoctorWithReferralsCannotBeDeletedAndTheMessageSaysWhatToDoInstead()
    {
        var ok = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"d1"}]""") };
        Assert.True((await CatalogManage.DeleteDoctorAsync(Api(ok), "org-1", "d1")).Ok);
        Assert.Equal("DELETE", ok.Requests.Single().Method.Method);

        var referred = await CatalogManage.DeleteDoctorAsync(Api(new FakeServer { Handler = (_, _) => (HttpStatusCode.Conflict, """{"code":"23503","message":"fk"}""") }), "org-1", "d1");
        Assert.False(referred.Ok);
        Assert.Contains("untick Active", referred.Error);
    }

    [Fact]
    public async Task LoadsTheWholeDoctorRowForEditing()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"d1","name":"Dr Rao","specialization":null,"phone":"98765","email":"r@x.in","address":"MG Rd","commission_percentage":12.5,"is_active":false,"notes":"n"}]""") };
        var (doctor, error) = await CatalogManage.LoadDoctorAsync(Api(server), "org-1", "d1");
        Assert.Null(error);
        Assert.Equal(new DoctorInput("Dr Rao", "", "98765", "r@x.in", "MG Rd", "12.5", false, "n"), doctor!.Input);
    }

    [Theory]
    [InlineData(750, 0, 750)]
    [InlineData(750, 10, 675)]
    [InlineData(333, 33.33, 222.01)]
    public void PackagePriceIsTheTestsLessTheDiscountPercentage(double total, double discount, double expected)
    {
        Assert.Equal((decimal)expected, CatalogManage.PackagePrice([(decimal)total], (decimal)discount));
    }

    [Fact]
    public async Task AddsAPackageThenItsTestsAtTheDiscountedPrice()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.Created, "") };
        var result = await CatalogManage.AddPackageAsync(Api(server), "org-1", new PackageInput(" Basic ", "", "10", ["t1", "t2", "t1"], true), Cat);
        Assert.True(result.Ok, result.Error);
        Assert.Equal(2, server.Requests.Count);
        var package = JsonDocument.Parse(server.Requests[0].Body).RootElement;
        Assert.EndsWith("/rest/v1/test_packages", server.Requests[0].Url);
        Assert.Equal(("Basic", 675m, 10m), (package.GetProperty("name").GetString(), package.GetProperty("price").GetDecimal(), package.GetProperty("discount_percentage").GetDecimal()));
        var links = JsonDocument.Parse(server.Requests[1].Body).RootElement;
        Assert.EndsWith("/rest/v1/test_package_tests", server.Requests[1].Url);
        Assert.Equal(["t1", "t2"], links.EnumerateArray().Select(l => l.GetProperty("test_id").GetString())); // each test once
        Assert.All(links.EnumerateArray(), l => Assert.Equal(package.GetProperty("id").GetString(), l.GetProperty("package_id").GetString()));
    }

    [Fact]
    public async Task APackageWhoseTestsCouldNotBeSavedIsRemovedAgain()
    {
        var server = new FakeServer { Handler = (r, _) => r.RequestUri!.AbsolutePath.EndsWith("test_package_tests") ? (HttpStatusCode.InternalServerError, """{"message":"boom"}""") : (HttpStatusCode.Created, "") };
        var result = await CatalogManage.AddPackageAsync(Api(server), "org-1", new PackageInput("Basic", "", "0", ["t1"], true), Cat);
        Assert.False(result.Ok);
        Assert.Equal("DELETE", server.Requests[^1].Method.Method);
        Assert.Contains("/rest/v1/test_packages?id=eq.", server.Requests[^1].Url);
    }

    [Theory]
    [InlineData("", "0", "name")]
    [InlineData("Basic", "200", "percentage")]
    public async Task RefusesBadPackageInput(string name, string discount, string expected)
    {
        var server = new FakeServer();
        var result = await CatalogManage.AddPackageAsync(Api(server), "org-1", new PackageInput(name, "", discount, ["t1"], true), Cat);
        Assert.Contains(expected, result.Error, StringComparison.OrdinalIgnoreCase);
        var none = await CatalogManage.AddPackageAsync(Api(server), "org-1", new PackageInput("Basic", "", "0", [], true), Cat);
        Assert.Contains("at least one", none.Error);
        var gone = await CatalogManage.AddPackageAsync(Api(server), "org-1", new PackageInput("Basic", "", "0", ["zzz"], true), Cat);
        Assert.Contains("no longer in the catalog", gone.Error);
        Assert.Empty(server.Requests);
    }

    [Fact]
    public async Task UpdatingAPackageReplacesItsTestsAndDeletingRemovesThemFirst()
    {
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, """[{"id":"pk1"}]""") };
        Assert.True((await CatalogManage.UpdatePackageAsync(Api(server), "org-1", "pk1", new PackageInput("Basic", "d", "0", ["t2"], true), Cat)).Ok);
        Assert.Equal(["PATCH", "DELETE", "POST"], server.Requests.Select(r => r.Method.Method));
        Assert.Contains("/rest/v1/test_package_tests?package_id=eq.pk1", server.Requests[1].Url);

        server.Requests.Clear();
        Assert.True((await CatalogManage.DeletePackageAsync(Api(server), "org-1", "pk1")).Ok);
        Assert.Equal(["test_package_tests", "test_packages"], server.Requests.Select(r => r.Url.Split("/rest/v1/")[1].Split('?')[0]));
    }
}
