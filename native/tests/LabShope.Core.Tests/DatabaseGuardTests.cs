using LabShope.Core.Data;

namespace LabShope.Core.Tests;

public class DatabaseGuardTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"labshope-guard-{Guid.NewGuid():N}");
    private string Db => Path.Combine(_dir, "lims.db");
    private string Backups => Path.Combine(_dir, "backups");

    private void Seed(string name)
    {
        using var store = DatabaseGuard.Open(Db, Backups).Store;
        store.UpsertPatient(new Patient($"id-{name}", $"IRM-{name}", name, "+919876543210", null, null));
    }

    [Fact]
    public void AHealthyDatabaseOpensAndGetsADailyBackup()
    {
        Directory.CreateDirectory(_dir);
        var opened = DatabaseGuard.Open(Db, Backups, today: new DateTime(2026, 10, 29));
        using var store = opened.Store;
        store.UpsertPatient(new Patient("p1", "IRM-1", "Asha", "+919876543210", null, null));

        Assert.Null(opened.Notice);
        Assert.True(File.Exists(Path.Combine(Backups, "lims-20261029.db")));
    }

    [Fact]
    public void OnlyOneBackupADayAndOnlyTheLastFewAreKept()
    {
        Directory.CreateDirectory(_dir);
        using var store = DatabaseGuard.Open(Db, Backups, keep: 3, today: new DateTime(2026, 10, 1)).Store;
        for (var day = 1; day <= 6; day++)
        {
            DatabaseGuard.BackupIfDue(store, Backups, 3, new DateTime(2026, 10, day));
            DatabaseGuard.BackupIfDue(store, Backups, 3, new DateTime(2026, 10, day)); // a second run the same day does nothing new
        }
        Assert.Equal(["lims-20261004.db", "lims-20261005.db", "lims-20261006.db"], DatabaseGuard.Backups(Backups).Select(Path.GetFileName).OrderBy(x => x));
    }

    [Fact]
    public void ABackupIsAWorkingCopyOfTheData()
    {
        Directory.CreateDirectory(_dir);
        using (var store = DatabaseGuard.Open(Db, Backups, today: new DateTime(2026, 10, 29)).Store)
            store.UpsertPatient(new Patient("p1", "IRM-1", "Asha Rao", "+919876543210", null, null));
        // The backup was made before the patient was added; make one now and read it as its own database.
        using (var store = new LocalStore(Db)) store.BackupTo(Path.Combine(_dir, "copy.db"));
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        using var copy = new LocalStore(Path.Combine(_dir, "copy.db"));
        Assert.Equal("Asha Rao", copy.GetPatient("p1")!.FullName);
    }

    [Fact]
    public void ADamagedDatabaseIsSetAsideAndTheNewestBackupIsRestored()
    {
        Directory.CreateDirectory(_dir);
        using (var s = DatabaseGuard.Open(Db, Backups, today: new DateTime(2026, 10, 28)).Store)
        {
            s.UpsertPatient(new Patient("p1", "IRM-1", "Kept In Backup", "+919876543210", null, null));
            DatabaseGuard.BackupIfDue(s, Backups, 7, new DateTime(2026, 10, 29)); // yesterday's patient is in the backup
        }
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.WriteAllBytes(Db, new byte[4096].Select((_, i) => (byte)(i * 7)).ToArray()); // garbage instead of a database

        var opened = DatabaseGuard.Open(Db, Backups, today: new DateTime(2026, 10, 30));
        using var store = opened.Store;

        Assert.Contains("restored from the backup of 29 Oct 2026", opened.Notice);
        Assert.Equal("Kept In Backup", store.GetPatient("p1")!.FullName);
        Assert.Single(Directory.GetFiles(_dir, "lims.db.damaged-*")); // the damaged file is kept for support
    }

    [Fact]
    public void WithNoBackupADamagedDatabaseStartsFreshAndSaysSo()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllBytes(Db, new byte[4096].Select((_, i) => (byte)(i * 11)).ToArray());

        var opened = DatabaseGuard.Open(Db, Backups);
        using var store = opened.Store;

        Assert.Contains("was reset", opened.Notice);
        Assert.Equal(0, store.PatientCount());
        store.UpsertPatient(new Patient("p1", "IRM-1", "Works Again", "+919876543210", null, null)); // and it is usable
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { Directory.Delete(_dir, true); } catch { }
    }
}
