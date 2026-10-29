namespace LabShope.Core.Tests;

public class InstanceLockTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-lock-{Guid.NewGuid():N}", "instance.lock");

    [Fact]
    public void OnlyOneCopyCanHoldTheLockAtATime()
    {
        using var first = InstanceLock.TryAcquire(_path);
        Assert.NotNull(first);
        Assert.Null(InstanceLock.TryAcquire(_path)); // a second copy is turned away
    }

    [Fact]
    public void TheLockIsFreeAgainOnceTheFirstCopyCloses()
    {
        InstanceLock.TryAcquire(_path)!.Dispose();
        using var second = InstanceLock.TryAcquire(_path);
        Assert.NotNull(second);
    }

    public void Dispose() { try { Directory.Delete(Path.GetDirectoryName(_path)!, true); } catch { } }
}
