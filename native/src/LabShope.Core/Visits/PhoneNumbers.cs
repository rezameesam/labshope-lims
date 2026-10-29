namespace LabShope.Core.Visits;

/// <summary>Same phone rules as the web app, so numbers match patients registered there.</summary>
public static class PhoneNumbers
{
    public const string DefaultCountryCode = "91";
    private static readonly string[] KnownCodes = ["971", "91", "44", "61", "65", "81", "1"];

    private static string Digits(string? v) => new((v ?? "").Where(c => c is >= '0' and <= '9').ToArray());
    private static bool ValidLength(string digits) => digits.Length is >= 8 and <= 15;

    /// <summary>Returns the number in storage form (+919876543210), or null when it isn't a usable number.</summary>
    public static string? Normalize(string? value, string countryCode = DefaultCountryCode)
    {
        var raw = (value ?? "").Trim();
        if (raw.Length == 0) return null;

        if (raw.StartsWith('+')) { var d = Digits(raw); return ValidLength(d) ? "+" + d : null; }
        if (raw.StartsWith("00")) { var d = Digits(raw[2..]); return ValidLength(d) ? "+" + d : null; }

        var digits = Digits(raw);
        if (digits.Length == 0) return null;
        if (digits.Length == 10) return $"+{countryCode}{digits}";
        if (digits.Length == 11 && digits.StartsWith('0')) return $"+{countryCode}{digits[1..]}";
        if (digits.StartsWith(countryCode) && ValidLength(digits)) return "+" + digits;
        return ValidLength(digits) ? "+" + digits : null;
    }

    /// <summary>Every way the same number may have been stored, used to find an existing patient.</summary>
    public static IReadOnlyList<string> LookupVariants(string? value, string countryCode = DefaultCountryCode)
    {
        var normalized = Normalize(value, countryCode);
        if (normalized is null) return [];

        var digits = normalized[1..];
        var code = KnownCodes.FirstOrDefault(c => digits.StartsWith(c) && digits.Length - c.Length >= 6) ?? countryCode;
        var national = digits.StartsWith(code) ? digits[code.Length..] : digits;

        return new[] { normalized, digits, national, national.Length > 0 ? "0" + national : "", national.Length > 0 ? code + national : "" }
            .Where(v => v.Length > 0).Distinct().ToList();
    }
}
