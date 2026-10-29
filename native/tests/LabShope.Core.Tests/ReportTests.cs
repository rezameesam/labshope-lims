using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class ReportTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly ResultService _results;
    private readonly VisitService _visits;

    public ReportTests()
    {
        _store = new LocalStore(_path);
        _store.ReplaceCatalog(new Catalog([new CatalogTest("t1", "HB", "Haemoglobin", 200m, null, "g/dL", null, 13m, 17m), new CatalogTest("t2", "BG", "Blood Group", 100m, null)], [], [], [], []));
        _store.UpsertPatient(new Patient("p1", "IRM-0007", "Asha <Rao>", "+919876543210", "female", "1990-05-01"));
        _visits = new VisitService(_store);
        _results = new ResultService(_store, "org-1", "u1");
    }

    private IReadOnlyList<WorklistRow> Order(params string[] tests)
    {
        _visits.Register(new RegisterVisitInput("org-1", "l1", "2026-10-29", tests.Select(t => new VisitTest(t, 100)).ToList(), ExistingPatient: _store.GetPatient("p1")));
        return _store.SearchWorklist("", ["pending"]);
    }

    [Fact]
    public void NothingToReportUntilATestIsCompleted()
    {
        Order("Haemoglobin");
        Assert.Null(ReportBuilder.For(_store, "Demo Lab", "p1", "2026-10-29"));
    }

    [Fact]
    public void ReportsSingleAndPanelResultsWithRangesAndAbnormalMarks()
    {
        var rows = Order("Haemoglobin", "CBC", "Blood Group");
        _results.Enter(rows.Single(r => r.TestName == "Haemoglobin").Id, "11.2");
        _results.EnterPanel(rows.Single(r => r.TestName == "CBC").Id, [new ResultItem("HGB", "9.8", "g/dL", "11.5", "16.5", ""), new ResultItem("WBC", "6.1", "10^9/L", "3.5", "10.0", "")]);
        // Blood Group left pending: it must not appear.

        var report = ReportBuilder.For(_store, "Demo Lab", "p1", "2026-10-29", new DateTimeOffset(2026, 10, 29, 0, 0, 0, TimeSpan.Zero))!;

        Assert.Equal(["Haemoglobin", "CBC"], report.Sections.Select(s => s.TestName));
        var hb = report.Sections[0].Lines.Single();
        Assert.Equal(("11.2", "g/dL", "13 - 17", true), (hb.Result, hb.Unit, hb.Reference, hb.Abnormal));
        Assert.True(report.Sections[1].IsPanel);
        Assert.Equal([true, false], report.Sections[1].Lines.Select(l => l.Abnormal));
        Assert.Equal("36 y", report.Age);
        Assert.True(report.Provisional); // results still waiting to be sent
    }

    [Fact]
    public void HtmlEscapesNamesAndMarksAbnormalRows()
    {
        var rows = Order("Haemoglobin");
        _results.Enter(rows[0].Id, "11.2");
        var html = ReportHtml.Build(ReportBuilder.For(_store, "Demo & Lab", "p1", "2026-10-29")!);

        Assert.Contains("Demo &amp; Lab", html);
        Assert.Contains("Asha &lt;Rao&gt;", html);
        Assert.Contains("class=\"abn\"", html);
        Assert.Contains("13 - 17", html);
        Assert.Contains("Preliminary", html);
    }

    [Fact]
    public void WritesASampleForReview()
    {
        var dir = Environment.GetEnvironmentVariable("LABSHOPE_SHOT_DIR");
        if (dir is null) return;
        var rows = Order("Haemoglobin", "CBC");
        _results.Enter(rows.Single(r => r.TestName == "Haemoglobin").Id, "11.2");
        _results.EnterPanel(rows.Single(r => r.TestName == "CBC").Id, PanelDefaults.For("CBC").Select(i => i.Name switch { "HGB" => i with { Value = "9.8" }, "WBC" => i with { Value = "6.1" }, "PLT" => i with { Value = "250" }, "RBC" => i with { Value = "4.2" }, _ => i }).ToList());
        File.WriteAllText(Path.Combine(dir, "report.html"), ReportHtml.Build(ReportBuilder.For(_store, "Sunrise Diagnostics", "p1", "2026-10-29")!));
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
