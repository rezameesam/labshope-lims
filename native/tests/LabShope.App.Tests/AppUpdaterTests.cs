using LabShope.App;

namespace LabShope.App.Tests;

public class AppUpdaterTests
{
    private sealed class FakeBackend : IUpdateBackend
    {
        public bool IsInstalled { get; set; } = true;
        public string? Newer { get; set; }
        public Exception? Failure { get; set; }
        public int Checks, Downloads, Applied;

        public Task<string?> CheckAsync() { Checks++; if (Failure is not null) throw Failure; return Task.FromResult(Newer); }
        public Task DownloadAsync(Action<int> progress) { Downloads++; progress(40); progress(100); return Task.CompletedTask; }
        public void ApplyAndRestart() => Applied++;
    }

    [Fact]
    public async Task ANewerVersionIsDownloadedQuietlyAndOnlyInstalledWhenAsked()
    {
        var backend = new FakeBackend { Newer = "1.1.0" };
        var updater = new AppUpdater(backend);
        var seen = new List<UpdateState>();
        updater.Changed += () => seen.Add(updater.State);

        await updater.RunAsync();

        Assert.Equal(UpdateState.Ready, updater.State);
        Assert.Equal("1.1.0", updater.NewVersion);
        Assert.Equal(100, updater.Percent);
        Assert.Equal(1, backend.Downloads);
        Assert.Equal(0, backend.Applied); // nothing restarts by itself
        Assert.Contains(UpdateState.Checking, seen);
        Assert.Contains(UpdateState.Downloading, seen);

        Assert.True(updater.ApplyAndRestart());
        Assert.Equal(1, backend.Applied);
    }

    [Fact]
    public async Task WhenAlreadyNewestNothingIsDownloaded()
    {
        var backend = new FakeBackend { Newer = null };
        var updater = new AppUpdater(backend);
        await updater.RunAsync();
        Assert.Equal(UpdateState.UpToDate, updater.State);
        Assert.Equal(0, backend.Downloads);
        Assert.False(updater.ApplyAndRestart());
        Assert.Equal(0, backend.Applied);
    }

    [Fact]
    public async Task ACopyThatWasNotInstalledIsLeftAlone()
    {
        var backend = new FakeBackend { IsInstalled = false, Newer = "9.9.9" };
        var updater = new AppUpdater(backend);
        await updater.RunAsync();
        Assert.Equal(UpdateState.NotInstalled, updater.State);
        Assert.Equal(0, backend.Checks);
    }

    [Fact]
    public async Task ProblemsAreRememberedNotThrownAndTheNextTryWorks()
    {
        var backend = new FakeBackend { Failure = new HttpRequestException("offline") };
        var updater = new AppUpdater(backend);
        await updater.RunAsync();
        Assert.Equal(UpdateState.Failed, updater.State);
        Assert.Equal("offline", updater.Error);

        backend.Failure = null;
        backend.Newer = "1.0.2";
        await updater.RunAsync();
        Assert.Equal(UpdateState.Ready, updater.State);
        Assert.Null(updater.Error);
    }

    [Fact]
    public async Task ReadyStateIsNotCheckedAgain()
    {
        var backend = new FakeBackend { Newer = "1.1.0" };
        var updater = new AppUpdater(backend);
        await updater.RunAsync();
        await updater.RunAsync();
        Assert.Equal(1, backend.Checks);
    }
}
