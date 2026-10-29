namespace LabShope.Core.Data;

/// <summary>
/// Opens the lab's local database safely. The file holds work that hasn't reached the server yet, so: it is checked every time the app starts;
/// if it is damaged (a power cut mid-write, a failing disk) the damaged file is set aside and the newest good backup is restored, or the app
/// starts afresh and downloads everything again; and a backup copy is made once a day (the last few are kept).
/// </summary>
public static class DatabaseGuard
{
    public sealed record OpenResult(LocalStore Store, string? Notice);

    public static OpenResult Open(string databasePath, string backupDirectory, int keep = 7, DateTime? today = null)
    {
        string? notice = null;
        var store = TryOpen(databasePath);

        if (store is null)
        {
            // Damaged. Keep the evidence, then recover from the newest backup that is itself healthy.
            var aside = databasePath + $".damaged-{DateTime.Now:yyyyMMdd-HHmmss}";
            try { File.Move(databasePath, aside, overwrite: true); } catch { /* best effort */ }
            foreach (var ext in new[] { "-wal", "-shm" }) try { File.Delete(databasePath + ext); } catch { }
            AppLog.Error($"The local database was damaged and was moved to {aside}.");

            foreach (var backup in Backups(backupDirectory).OrderByDescending(f => f))
            {
                try
                {
                    File.Copy(backup, databasePath, overwrite: true);
                    store = TryOpen(databasePath);
                    if (store is not null)
                    {
                        notice = $"The data on this computer had a problem and was restored from the backup of {BackupDate(backup)}. Work done after that may need to be done again.";
                        break;
                    }
                }
                catch (IOException) { }
            }

            if (store is null)
            {
                store = new LocalStore(databasePath);
                notice = "The data on this computer had a problem and was reset. Everything that had already been sent is downloaded again; work that had not been sent yet could not be recovered.";
            }
        }

        BackupIfDue(store, backupDirectory, keep, today ?? DateTime.Now);
        return new OpenResult(store, notice);
    }

    private static LocalStore? TryOpen(string path)
    {
        LocalStore? store = null;
        try
        {
            store = new LocalStore(path);
            if (store.IsHealthy()) return store;
        }
        catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or IOException) { AppLog.Error("Could not open the local database", ex); }
        store?.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        return null;
    }

    /// <summary>Makes today's backup if there isn't one yet, and removes the oldest beyond <paramref name="keep"/>.</summary>
    public static void BackupIfDue(LocalStore store, string backupDirectory, int keep, DateTime today)
    {
        try
        {
            Directory.CreateDirectory(backupDirectory);
            var file = Path.Combine(backupDirectory, $"lims-{today:yyyyMMdd}.db");
            if (!File.Exists(file)) store.BackupTo(file);
            foreach (var old in Backups(backupDirectory).OrderByDescending(f => f).Skip(keep)) File.Delete(old);
        }
        catch (Exception ex) { AppLog.Error("Could not make a backup of the local database", ex); } // never stop the app for this
    }

    public static IEnumerable<string> Backups(string directory) =>
        Directory.Exists(directory) ? Directory.GetFiles(directory, "lims-????????.db") : [];

    private static string BackupDate(string file) =>
        DateTime.TryParseExact(Path.GetFileNameWithoutExtension(file)[5..], "yyyyMMdd", null, System.Globalization.DateTimeStyles.None, out var d) ? d.ToString("d MMM yyyy") : "an earlier day";
}
