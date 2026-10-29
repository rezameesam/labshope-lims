namespace LabShope.App;

/// <summary>Where the lab's data lives. The key is the project's public (publishable) key, safe to ship.</summary>
public static class AppConfig
{
    public const string SupabaseUrl = "https://ceyfwoczyhnwipacwhcn.supabase.co";
    public const string SupabaseKey = "sb_publishable_wvKhIMjZFBk57gsMvGzFaA_IrAAt6h0";

    public static string DataDirectory
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LabShope");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }
}
