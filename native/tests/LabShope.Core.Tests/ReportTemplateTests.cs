using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class ReportTemplateTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    private static ReportTemplate T(string id, string? org = Org, string? category = null, string? testId = null, bool isDefault = false, string? header = null, string? footer = null,
        bool range = true, bool flag = true) => new(id, id, org, category, testId, header, footer, "table", range, flag, false, isDefault);

    private static Catalog CatalogWith(params ReportTemplate[] templates) => new(
        [new CatalogTest("t-cbc", "CBC", "CBC", 300m, "c-blood"), new CatalogTest("t-hb", "HB", "Haemoglobin", 200m, "c-blood"), new CatalogTest("t-tsh", "TSH", "TSH", 400m, "c-hormone")],
        [], [], [new LabRef("l1", "Main Lab", "ML")], [],
        [new TestCategory("c-blood", "Blood"), new TestCategory("c-hormone", "Hormones")], templates);

    public ReportTemplateTests() => _store = new LocalStore(_path);

    [Fact]
    public void ASingleTestUsesItsOwnTemplateThenItsCategorysThenTheDefault()
    {
        var catalog = CatalogWith(T("default", isDefault: true), T("blood", category: "Blood"), T("cbc-only", testId: "t-cbc"));

        Assert.Equal("cbc-only", ReportTemplates.Resolve(catalog, Org, ["CBC"])!.Id);
        Assert.Equal("blood", ReportTemplates.Resolve(catalog, Org, ["Haemoglobin"])!.Id);
        Assert.Equal("default", ReportTemplates.Resolve(catalog, Org, ["TSH"])!.Id);
    }

    [Fact]
    public void SeveralTestsOfOneCategoryUseThatCategoryOtherwiseTheDefault()
    {
        var catalog = CatalogWith(T("default", isDefault: true), T("blood", category: "Blood"));
        Assert.Equal("blood", ReportTemplates.Resolve(catalog, Org, ["CBC", "Haemoglobin"])!.Id);
        Assert.Equal("default", ReportTemplates.Resolve(catalog, Org, ["CBC", "TSH"])!.Id); // two categories
    }

    [Fact]
    public void TheLabsOwnTemplateBeatsASharedOneAndNoTemplateMeansNone()
    {
        var catalog = CatalogWith(T("shared", org: null, isDefault: true), T("mine", isDefault: true));
        Assert.Equal("mine", ReportTemplates.Resolve(catalog, Org, ["TSH"])!.Id);
        Assert.Null(ReportTemplates.Resolve(CatalogWith(), Org, ["TSH"]));
        Assert.Null(ReportTemplates.Resolve(CatalogWith(T("blood", category: "Blood")), Org, ["TSH"])); // nothing matches and there is no default
    }

    [Fact]
    public void FillsMarkersAndTurnsSimpleHtmlIntoLinesLikeTheWebsite()
    {
        var ctx = new Dictionary<string, string> { ["patient_name"] = "Asha Rao", ["patient_id"] = "IRM-1", ["lab_name"] = "Sunrise" };

        var text = ReportTemplates.RenderText("<p><strong>Patient:</strong> {patient_name} ({patient_id})</p><p>Processed at {lab_name}</p><ul><li>one</li><li>two&nbsp;x</li></ul><br/>end", ctx);

        Assert.Equal("Patient: Asha Rao (IRM-1)\nProcessed at Sunrise\n• one\n• two x\n\nend".Replace("\n\n", "\n\n"), text);
        Assert.Equal("", ReportTemplates.RenderText(null, ctx));
    }

    [Fact]
    public void ThePrintedReportCarriesTheTemplatesHeaderFooterAndHidesWhatItTurnsOff()
    {
        _store.ReplaceCatalog(CatalogWith(T("default", isDefault: true, header: "<p>Collected: {test_date} at {lab_name} ({lab_code})</p>", footer: "<p>Reviewed by {entered_by}</p>", range: false, flag: false)));
        _store.UpsertPatient(new Patient("p1", "IRM-1", "Asha Rao", "+919876543210", "female", null));
        new VisitService(_store).Register(new RegisterVisitInput(Org, "l1", "2026-10-29", [new VisitTest("Haemoglobin", 200)], ExistingPatient: _store.GetPatient("p1")));
        new ResultService(_store, Org, "u").Enter(_store.SearchWorklist("", ["pending"])[0].Id, "11", markedAbnormal: true);

        var report = ReportBuilder.For(_store, "Sunrise", "p1", "2026-10-29", organizationId: Org, labId: "l1")!;
        var html = ReportHtml.Build(report);

        Assert.Equal("Collected: 2026-10-29 at Sunrise (ML)", report.HeaderText);
        Assert.Contains("Collected: 2026-10-29 at Sunrise (ML)", html);
        Assert.Contains("Reviewed by Sunrise", html);
        Assert.DoesNotContain("Reference range", html);   // the template turned the range column off
        Assert.DoesNotContain("class=\"abn\"", html);     // ...and the abnormal marking
        Assert.DoesNotContain("Outside the reference range", html);

        // Without a template the report is as before.
        _store.ReplaceCatalog(CatalogWith());
        var plain = ReportHtml.Build(ReportBuilder.For(_store, "Sunrise", "p1", "2026-10-29", organizationId: Org, labId: "l1")!);
        Assert.Contains("Reference range", plain);
        Assert.Contains("class=\"abn\"", plain);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
