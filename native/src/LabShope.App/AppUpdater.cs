using Velopack;
using Velopack.Sources;

namespace LabShope.App;

/// <summary>What the update mechanism needs, so the behaviour can be tested without a real installer.</summary>
public interface IUpdateBackend
{
    /// <summary>False when the app was not started from an installed copy (a development build, a portable copy): nothing to update.</summary>
    bool IsInstalled { get; }
    /// <summary>The version of a newer release, or null when this is the newest.</summary>
    Task<string?> CheckAsync();
    Task DownloadAsync(Action<int> progress);
    void ApplyAndRestart();
}

/// <summary>Updates from the downloads bucket: the installer builds publish a feed there (updates/releases.&lt;channel&gt;.json and the packages).</summary>
public sealed class VelopackBackend(string feedUrl) : IUpdateBackend
{
    private UpdateManager? _manager;
    private bool _unavailable;
    private UpdateInfo? _pending;

    /// <summary>The manager only exists when the app was started by the installer's launcher (otherwise Velopack has no install to update).</summary>
    private UpdateManager? Manager
    {
        get
        {
            if (_manager is not null || _unavailable) return _manager;
            try { _manager = new UpdateManager(new SimpleWebSource(feedUrl)); }
            catch (InvalidOperationException) { _unavailable = true; }
            return _manager;
        }
    }

    public bool IsInstalled => Manager?.IsInstalled == true;

    public async Task<string?> CheckAsync()
    {
        _pending = await Manager!.CheckForUpdatesAsync();
        return _pending?.TargetFullRelease.Version.ToString();
    }

    public Task DownloadAsync(Action<int> progress) => Manager!.DownloadUpdatesAsync(_pending ?? throw new InvalidOperationException("Check for updates first."), progress);

    public void ApplyAndRestart() => Manager!.ApplyUpdatesAndRestart(_pending ?? throw new InvalidOperationException("Check for updates first."));
}

public enum UpdateState { Idle, Checking, Downloading, Ready, UpToDate, NotInstalled, Failed }

/// <summary>
/// Looks for a newer version, downloads it quietly and then waits: the app only restarts when the person chooses, never in the middle of work.
/// Anything that goes wrong (no internet, the feed unreachable) is ignored apart from a message; it is tried again later.
/// </summary>
public sealed class AppUpdater(IUpdateBackend backend)
{
    public const string DefaultFeedUrl = "https://lims-downloads.labshope.com/updates";

    public UpdateState State { get; private set; } = UpdateState.Idle;
    public string? NewVersion { get; private set; }
    public int Percent { get; private set; }
    public string? Error { get; private set; }

    /// <summary>Raised whenever the state or progress changes (on any thread).</summary>
    public event Action? Changed;

    public static AppUpdater Create()
    {
        var url = Environment.GetEnvironmentVariable("LABSHOPE_UPDATE_URL");
        return new AppUpdater(new VelopackBackend(string.IsNullOrWhiteSpace(url) ? DefaultFeedUrl : url.Trim()));
    }

    /// <summary>Checks, and if there is a newer version downloads it. Safe to call again; does nothing while busy or already ready.</summary>
    public async Task RunAsync()
    {
        if (State is UpdateState.Checking or UpdateState.Downloading or UpdateState.Ready) return;
        try
        {
            if (!backend.IsInstalled) { Set(UpdateState.NotInstalled); return; }
            Error = null;
            Set(UpdateState.Checking);
            NewVersion = await backend.CheckAsync();
            if (NewVersion is null) { Set(UpdateState.UpToDate); return; }

            Percent = 0;
            Set(UpdateState.Downloading);
            await backend.DownloadAsync(p => { Percent = p; Changed?.Invoke(); });
            Set(UpdateState.Ready);
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            LabShope.Core.AppLog.Error("Could not check for or download an update", ex);
            Set(UpdateState.Failed);
        }
    }

    /// <summary>Installs the downloaded version and starts the app again. Only valid when <see cref="State"/> is Ready.</summary>
    public bool ApplyAndRestart()
    {
        if (State != UpdateState.Ready) return false;
        backend.ApplyAndRestart();
        return true;
    }

    private void Set(UpdateState state)
    {
        State = state;
        Changed?.Invoke();
    }
}
