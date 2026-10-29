using LabShope.Core.Data;

namespace LabShope.Core.Tests;

public class DatesTests
{
    [Theory]
    [InlineData("1985-03-07", "07/03/1985")]
    [InlineData("2024-02-29", "29/02/2024")]
    [InlineData("", "")]
    [InlineData(null, "")]
    [InlineData("unknown", "unknown")] // never hide what is stored
    public void StoredDatesAreShownDayFirst(string? stored, string shown) => Assert.Equal(shown, Dates.FromIso(stored));

    [Fact]
    public void MomentsAreShownDayFirstWithAmPmLikeTheWebsite()
    {
        var local = new DateTimeOffset(2026, 10, 29, 14, 5, 0, TimeZoneInfo.Local.GetUtcOffset(new DateTime(2026, 10, 29, 14, 5, 0)));
        Assert.Equal("29/10/2026, 02:05 PM", Dates.FromMoment(local.ToString("O")));
        var morning = new DateTimeOffset(2026, 1, 5, 0, 30, 0, TimeZoneInfo.Local.GetUtcOffset(new DateTime(2026, 1, 5, 0, 30, 0)));
        Assert.Equal("05/01/2026, 12:30 AM", Dates.DateTime(morning));
        Assert.Equal("not a date", Dates.FromMoment("not a date"));
    }

    [Theory]
    [InlineData("1985-03-07", "2026-03-06", "40 y")] // the day before the 41st birthday
    [InlineData("1985-03-07", "2026-03-07", "41 y")] // on the birthday
    [InlineData("1985-12-31", "2026-01-02", "40 y")] // born late December: not a year older in January
    [InlineData("2024-02-29", "2025-02-28", "1 y")] // a leap-day baby has the birthday on 28 Feb in other years
    [InlineData("2025-06-15", "2026-03-14", "8 m")] // an infant, counted in whole months
    [InlineData("2026-10-01", "2026-10-29", "28 d")] // a newborn in days
    [InlineData("2027-01-01", "2026-10-29", null)] // not born yet
    [InlineData(null, "2026-10-29", null)]
    public void AgeIsCountedByBirthdays(string? born, string today, string? expected) =>
        Assert.Equal(expected, PatientAge.Of(born, DateOnly.Parse(today)));
}
