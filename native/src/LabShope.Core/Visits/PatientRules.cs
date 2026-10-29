using System.Globalization;

namespace LabShope.Core.Visits;

/// <summary>The checks every patient record passes, wherever it comes from (the screens may also check, but this is what counts).</summary>
public static class PatientRules
{
    public const int MaxNameLength = 120;

    public static string CleanName(string? name)
    {
        var clean = (name ?? "").Trim();
        if (clean.Length == 0) throw new ArgumentException("Enter the patient's name.");
        if (clean.Length > MaxNameLength) throw new ArgumentException($"The name is too long (at most {MaxNameLength} characters).");
        return clean;
    }

    /// <summary>Returns the date as yyyy-MM-dd (what the server stores), null when empty; throws for a date nobody could have.</summary>
    public static string? CleanBirthDate(string? text, DateOnly today)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        if (!DateOnly.TryParseExact(text.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            throw new ArgumentException("Enter the date of birth as a calendar date (for example by picking it).");
        if (date > today) throw new ArgumentException("The date of birth can't be in the future.");
        if (date.Year < 1900) throw new ArgumentException("Check the date of birth: that is before 1900.");
        return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    /// <summary>Money is whole paise: anything finer is rounded the way the server (numeric 2 decimals) would.</summary>
    public static decimal Paise(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);
}
