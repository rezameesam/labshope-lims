using System.Globalization;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

[Collection("Culture")] // changes the process-wide culture, so these must not run alongside other tests
public class AppCultureTests : IDisposable
{
    private readonly CultureInfo _before = CultureInfo.CurrentCulture;

    [Theory]
    [InlineData("de-DE")]
    [InlineData("fr-FR")]
    [InlineData("th-TH")]
    [InlineData("ar-SA")]
    public void MoneyAndDatesBehaveTheSameOnAComputerSetToAnotherCountry(string regional)
    {
        CultureInfo.CurrentCulture = new CultureInfo(regional);
        AppCulture.Apply();

        Assert.Equal(100.5m, decimal.Parse("100.50"));
        Assert.Equal(1500.5m, decimal.Parse("1,500.50"));
        Assert.Equal("1250.5", 1250.5m.ToString("0.##"));
        Assert.Equal("29 Oct 2026", new DateTime(2026, 10, 29).ToString("dd MMM yyyy"));
        Assert.Equal("29/10/2026", new DateTime(2026, 10, 29).ToString("dd/MM/yyyy"));
    }

    [Fact]
    public void ReceiptsPrintTheGregorianYearEvenWhenTheComputerUsesAnotherCalendar()
    {
        CultureInfo.CurrentCulture = new CultureInfo("th-TH");
        AppCulture.Apply();
        Assert.Contains("2026", new DateTimeOffset(2026, 10, 29, 12, 0, 0, TimeSpan.Zero).ToString("dd MMM yyyy HH:mm"));
    }

    public void Dispose() => CultureInfo.CurrentCulture = _before;
}
