namespace LabShope.Core.Tests;

public class AppLogTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"labshope-log-{Guid.NewGuid():N}");

    [Fact]
    public void WritesErrorsWithTheirDetailsToTodaysFile()
    {
        AppLog.Start(_dir);
        AppLog.Info("started");
        AppLog.Error("Could not save", new InvalidOperationException("disk full"));

        var text = File.ReadAllText(Directory.GetFiles(_dir, "labshope-*.log").Single());
        Assert.Contains("INFO started", text);
        Assert.Contains("ERROR Could not save", text);
        Assert.Contains("disk full", text);
    }

    [Fact]
    public void RemovesLogsOlderThanTwoWeeksButKeepsRecentOnes()
    {
        Directory.CreateDirectory(_dir);
        var old = Path.Combine(_dir, "labshope-20200101.log");
        var recent = Path.Combine(_dir, "labshope-20991231.log");
        File.WriteAllText(old, "x"); File.WriteAllText(recent, "y");
        File.SetLastWriteTime(old, DateTime.Now.AddDays(-30));

        AppLog.Start(_dir);

        Assert.False(File.Exists(old));
        Assert.True(File.Exists(recent));
    }

    [Fact]
    public void NeverThrowsEvenWhenTheFolderIsUnusable()
    {
        AppLog.Start(Path.Combine(_dir, "a\0b")); // an invalid path
        AppLog.Error("still fine", new Exception("x"));
    }

    public void Dispose() { AppLog.Start(Path.Combine(Path.GetTempPath(), "labshope-log-unused")); try { Directory.Delete(_dir, true); } catch { } }
}

public class StartupFailureLogTests
{
    [Fact]
    public void AStartupFailureIsWrittenWithTheErrorAndTheComputerDetails()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"labshope-startup-{Guid.NewGuid():N}");
        try
        {
            var file = AppLog.WriteStartupFailure(new InvalidOperationException("boom at start"), dir);

            Assert.Equal(Path.Combine(dir, "startup-error.log"), file);
            var text = File.ReadAllText(file!);
            Assert.Contains("STARTUP FAILURE", text);
            Assert.Contains("boom at start", text);
            Assert.Contains("InvalidOperationException", text);

            AppLog.WriteStartupFailure(new Exception("second"), dir); // appended, not replaced
            Assert.Contains("second", File.ReadAllText(file));
            Assert.Contains("boom at start", File.ReadAllText(file));
        }
        finally { try { Directory.Delete(dir, true); } catch { } }
    }
}
