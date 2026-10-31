namespace LabShope.App;

/// <summary>Where the lab's data lives. The key is the project's public (publishable) key, safe to ship.</summary>
public static class AppConfig
{
    public const string SupabaseUrl = "https://ceyfwoczyhnwipacwhcn.supabase.co";
    public const string SupabaseKey = "sb_publishable_wvKhIMjZFBk57gsMvGzFaA_IrAAt6h0";

    private static readonly Lazy<string> _dataDirectory = new(() =>
    {
        var dir = LabShope.Core.DataFolder.Current();
        if (!LabShope.Core.DataFolder.IsOverridden)
            try { LabShope.Core.DataFolder.AdoptLegacy(dir, Environment.GetFolderPath(Environment.SpecialFolder.UserProfile, Environment.SpecialFolderOption.DoNotVerify)); }
            catch (Exception) { /* the old data stays where it is; the app still starts */ }
        Directory.CreateDirectory(dir);
        return dir;
    });

    /// <summary>The user's data folder (see <see cref="LabShope.Core.DataFolder"/>), created on first use.</summary>
    public static string DataDirectory => _dataDirectory.Value;
}
