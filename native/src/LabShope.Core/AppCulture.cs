using System.Globalization;

namespace LabShope.Core;

/// <summary>
/// Fixes how numbers and dates are read and written, whatever the computer's regional settings are.
/// Without this, a PC set to German reads "100.50" as 10,050 and one set to Thai prints receipts in the Buddhist calendar.
/// The app is used in India: "1,500.50" with a full stop for decimals, the Gregorian calendar, day first.
/// </summary>
public static class AppCulture
{
    public static CultureInfo Create()
    {
        try { return new CultureInfo("en-IN", useUserOverride: false); }
        catch (CultureNotFoundException) { return CultureInfo.InvariantCulture; } // a machine without culture data
    }

    public static void Apply()
    {
        var culture = Create();
        CultureInfo.DefaultThreadCurrentCulture = culture;
        CultureInfo.DefaultThreadCurrentUICulture = culture;
        CultureInfo.CurrentCulture = culture;
        CultureInfo.CurrentUICulture = culture;
    }
}
