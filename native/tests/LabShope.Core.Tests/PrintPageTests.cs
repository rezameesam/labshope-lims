using LabShope.Core.Printing;

namespace LabShope.Core.Tests;

public class PrintPageTests
{
    [Fact]
    public void ThePageAsksTheBrowserToPrintOnceItHasLoaded()
    {
        var page = PrintPage.WithAutoPrint("<!doctype html><html><head><title>Report</title></head><body class=\"a\"><h1>Hi</h1></body></html>");

        Assert.Contains("window.print()", page);
        Assert.Contains("addEventListener('load'", page);
        Assert.Contains("<h1>Hi</h1>", page);
        Assert.True(page.IndexOf("<body class=\"a\">", StringComparison.Ordinal) < page.IndexOf("labshope-print-bar", StringComparison.Ordinal)); // the bar sits inside the body
        Assert.True(page.IndexOf("labshope-print-bar", StringComparison.Ordinal) < page.IndexOf("<h1>", StringComparison.Ordinal));
    }

    [Fact]
    public void TheFallbackBarIsNotPrinted()
    {
        Assert.Contains("@media print{.labshope-print-bar{display:none !important}}", PrintPage.WithAutoPrint("<html><body>x</body></html>"));
    }

    [Fact]
    public void WorksWithoutABodyTagAndIsNotAppliedTwice()
    {
        var plain = PrintPage.WithAutoPrint("<p>just a fragment</p>");
        Assert.Contains("window.print()", plain);
        Assert.EndsWith("<p>just a fragment</p>", plain);

        Assert.Equal(plain, PrintPage.WithAutoPrint(plain));
        Assert.Equal("", PrintPage.WithAutoPrint(""));
    }

    [Fact]
    public void EveryPageTheAppPrintsKeepsItsOwnContent()
    {
        var receipt = PrintPage.WithAutoPrint("<html><BODY><table><tr><td>Total 350</td></tr></table></BODY></html>");
        Assert.Contains("<td>Total 350</td>", receipt);
        Assert.Contains("window.print()", receipt);
    }
}
