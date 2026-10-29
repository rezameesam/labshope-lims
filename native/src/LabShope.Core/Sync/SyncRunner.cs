using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.Core.Sync;

public sealed record SyncStatus(bool Online, bool NeedsSignIn, int Pending, int Failed, string? Error, DateTimeOffset? LastSyncedAt);

/// <summary>One full sync round: send queued visits first, then pull what changed. Never throws.</summary>
public sealed class SyncRunner
{
    private readonly SyncEngine _engine;
    private readonly LocalStore _store;
    private DateTimeOffset? _lastSyncedAt;

    public SyncRunner(SyncEngine engine, LocalStore store)
    {
        _engine = engine;
        _store = store;
    }

    public async Task<SyncStatus> RunOnceAsync(CancellationToken ct = default)
    {
        try
        {
            var flushed = await _engine.FlushOutboxAsync(ct);
            if (flushed.StoppedBy is { } stop) return Status(stop, null);

            await _engine.PullCatalogAsync(ct: ct);
            await _engine.PullPatientsAsync(ct);
            await _engine.PullPatientTestsAsync(ct);
            await _engine.PullInvoicesAsync(ct);
            _lastSyncedAt = DateTimeOffset.UtcNow;
            return Status(null, null);
        }
        catch (SyncException ex)
        {
            return Status(ErrorClassifier.Classify(ex.Result), ex.Message);
        }
    }

    public SyncStatus Current => Status(null, null);

    private SyncStatus Status(ErrorKind? problem, string? error)
    {
        var (pending, failed) = _store.OutboxCounts();
        return new SyncStatus(
            Online: problem is null or ErrorKind.Permanent or ErrorKind.Transient,
            NeedsSignIn: problem == ErrorKind.Auth,
            pending, failed, error, _lastSyncedAt);
    }
}
