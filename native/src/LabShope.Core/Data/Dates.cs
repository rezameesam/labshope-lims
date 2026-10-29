using System.Globalization;

namespace LabShope.Core.Data;

/// <summary>
/// How dates and times are shown, the same everywhere (screens and printouts) and the same as the website:
/// 29/10/2026 and 29/10/2026, 02:30 PM. What is stored and sent to the server is always yyyy-MM-dd / ISO and never goes through here.
/// </summary>
public static class Dates
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    public static string Date(DateTime date) => date.ToString("dd/MM/yyyy", Inv);

    public static string DateTime(DateTimeOffset moment)
    {
        var local = moment.ToLocalTime();
        return $"{local.ToString("dd/MM/yyyy", Inv)}, {local.ToString("hh:mm", Inv)} {(local.Hour < 12 ? "AM" : "PM")}";
    }

    /// <summary>A stored date (yyyy-MM-dd) as people read it; anything else is shown unchanged.</summary>
    public static string FromIso(string? text) =>
        System.DateTime.TryParseExact(text, "yyyy-MM-dd", Inv, DateTimeStyles.None, out var d) ? Date(d) : text ?? "";

    /// <summary>A stored moment (ISO text) as people read it; anything else is shown unchanged.</summary>
    public static string FromMoment(string? text) =>
        DateTimeOffset.TryParse(text, Inv, DateTimeStyles.None, out var m) ? DateTime(m) : text ?? "";
}

/// <summary>A patient's age from the date of birth, counted by birthdays (not by the year number).</summary>
public static class PatientAge
{
    public static string? Of(string? dateOfBirth, DateOnly today)
    {
        if (!DateOnly.TryParseExact(dateOfBirth, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var born) || born > today) return null;
        var years = today.Year - born.Year - (today < born.AddYears(today.Year - born.Year) ? 1 : 0);
        if (years >= 1) return $"{years} y";
        var months = (today.Year - born.Year) * 12 + today.Month - born.Month - (today.Day < born.Day ? 1 : 0);
        return months >= 1 ? $"{months} m" : $"{today.DayNumber - born.DayNumber} d";
    }
}
