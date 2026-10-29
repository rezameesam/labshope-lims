namespace LabShope.Core;

/// <summary>
/// A plain log file (one per day, kept for two weeks) so that when something unexpected happens there is a record to send
/// to support, and the app itself can carry on. Never throws: logging must not be able to cause a problem.
/// </summary>
public static class AppLog
{
    private static readonly object Gate = new();
    private static string? _directory;

    public static string? Directory => _directory;

    public static void Start(string directory, int keepDays = 14, DateTime? today = null)
    {
        try
        {
            System.IO.Directory.CreateDirectory(directory);
            _directory = directory;
            var cutoff = (today ?? DateTime.Now).Date.AddDays(-keepDays);
            foreach (var file in System.IO.Directory.GetFiles(directory, "labshope-*.log"))
                if (File.GetLastWriteTime(file).Date < cutoff) File.Delete(file);
        }
        catch { /* the log is best effort */ }
    }

    public static void Info(string message) => Write("INFO", message, null);

    public static void Error(string message, Exception? ex = null) => Write("ERROR", message, ex);

    private static void Write(string level, string message, Exception? ex)
    {
        try
        {
            if (_directory is null) return;
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {level} {message}{(ex is null ? "" : Environment.NewLine + ex)}{Environment.NewLine}";
            lock (Gate) File.AppendAllText(Path.Combine(_directory, $"labshope-{DateTime.Now:yyyyMMdd}.log"), line);
        }
        catch { /* never let logging fail the app */ }
    }
}
