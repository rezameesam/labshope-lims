using LabShope.Core.Finance;

namespace LabShope.Core.Tests;

public class OutsourceReportTests
{
    private static OutsourcedTest T(string lab, string date, decimal cost, decimal sell) => new("HbA1c", "Asha Rao", "IRM-1", lab, date, cost, sell);

    [Fact]
    public void GroupsByOutsideLabAndWorksOutTheMargin()
    {
        var r = OutsourceReports.Build([T("Metro", "2026-10-01", 200, 500), T("Metro", "2026-10-05", 100, 90), T("Apex", "2026-10-03", 50, 150)]);

        Assert.Equal(["2026-10-05", "2026-10-03", "2026-10-01"], r.Tests.Select(t => t.Date)); // newest first
        var metro = r.Labs.Single(l => l.Lab == "Metro");
        Assert.Equal((2, 300m, 590m, 290m), (metro.Count, metro.Cost, metro.Revenue, metro.Margin));
        Assert.Equal((350m, 740m, 390m), (r.TotalCost, r.TotalRevenue, r.TotalMargin));
        Assert.Equal(-10m, r.Tests.First(t => t.Date == "2026-10-05").Margin);
    }

    [Fact]
    public void ThePrintedReportListsLabsAndTestsAndEscapesNames()
    {
        var r = OutsourceReports.Build([new OutsourcedTest("T<b>", "A & B", "IRM-1", "Metro", "2026-10-01", 200, 500)]);
        var html = OutsourceReports.ToHtml("Sunrise Lab", r, new DateOnly(2026, 4, 1), new DateOnly(2026, 10, 31), new DateTime(2026, 10, 31, 9, 0, 0));

        Assert.Contains("Sunrise Lab", html);
        Assert.Contains("01/04/2026 to 31/10/2026", html);
        Assert.Contains("A &amp; B", html);
        Assert.DoesNotContain("T<b>", html);
        Assert.Contains("300.00", html);
    }
}
