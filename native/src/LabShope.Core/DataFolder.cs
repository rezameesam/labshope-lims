namespace LabShope.Core;

/// <summary>
/// The folder that holds this user's local database, login, backups and logs.
/// <para>
/// It sits in the system's per-user app-data folder (%APPDATA% on Windows, ~/.config on macOS and Ubuntu). A Mac does not have
/// ~/.config until something creates it, and asking .NET for a folder that is missing gives back "" — which once turned the data
/// folder into the bare relative path "LabShope". That followed whatever folder the app was started from: the home folder after
/// the installer, but "/" when opened from Finder or the Dock, where nothing can be written, so the app closed at once.
/// </para>
/// </summary>
public static class DataFolder
{
    public const string Name = "LabShope";

    /// <summary>Set to an absolute folder to keep the data somewhere else (the tests use it so they never touch real data).</summary>
    public const string OverrideVariable = "LABSHOPE_DATA_DIR";

    /// <summary>True when <see cref="OverrideVariable"/> names the folder; old data is then never moved.</summary>
    public static bool IsOverridden => Path.IsPathRooted(Environment.GetEnvironmentVariable(OverrideVariable) ?? "");

    /// <summary>The data folder for the running user. Never relative, whatever folder the app was started from.</summary>
    public static string Current() => IsOverridden ? Environment.GetEnvironmentVariable(OverrideVariable)! :
        Resolve(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData, Environment.SpecialFolderOption.DoNotVerify),
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile, Environment.SpecialFolderOption.DoNotVerify));

    /// <summary>Works out the data folder from the app-data folder ("" when the system did not give one) and the home folder.</summary>
    public static string Resolve(string? appData, string? home)
    {
        if (!string.IsNullOrEmpty(appData) && Path.IsPathRooted(appData)) return Path.Combine(appData, Name);
        if (!string.IsNullOrEmpty(home) && Path.IsPathRooted(home)) return Path.Combine(home, ".config", Name);
        return Path.Combine(Path.GetTempPath(), Name); // no home folder at all: somewhere writable beats closing at once
    }

    /// <summary>
    /// Brings data left in the old wrong place (a "LabShope" folder in the home folder, written when the app was started from
    /// there) into <paramref name="folder"/>, so labs that used the app that way keep their unsynced work and their login.
    /// Only moves a folder this app made (it holds the app's lock file and its login or database), and never over existing data.
    /// Returns true when it moved something.
    /// </summary>
    public static bool AdoptLegacy(string folder, string? home)
    {
        if (string.IsNullOrEmpty(home) || !Path.IsPathRooted(home)) return false;
        var legacy = Path.Combine(home, Name);
        if (string.Equals(Path.GetFullPath(legacy).TrimEnd(Path.DirectorySeparatorChar), Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar), StringComparison.Ordinal)) return false;
        if (!Directory.Exists(legacy) || Directory.Exists(folder)) return false;
        var ours = File.Exists(Path.Combine(legacy, "instance.lock"))
            && (File.Exists(Path.Combine(legacy, "account.json")) || Directory.EnumerateFiles(legacy, "lims-*.db").Any());
        if (!ours) return false;
        Directory.CreateDirectory(Path.GetDirectoryName(folder)!);
        Directory.Move(legacy, folder); // same disk: one rename, the database and its -wal/-shm files move together
        return true;
    }
}
