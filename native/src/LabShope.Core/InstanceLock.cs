namespace LabShope.Core;

/// <summary>
/// Lets only one copy of the app run per computer user. Two copies would write to the same local database and both try to sync,
/// so the second one is told to stand aside. The lock is released automatically if the app crashes.
/// </summary>
public sealed class InstanceLock : IDisposable
{
    private readonly FileStream _stream;

    private InstanceLock(FileStream stream) => _stream = stream;

    /// <summary>Returns the lock, or null when another copy already holds it.</summary>
    public static InstanceLock? TryAcquire(string path)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            return new InstanceLock(new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None));
        }
        catch (IOException) { return null; }
    }

    public void Dispose() => _stream.Dispose();
}
