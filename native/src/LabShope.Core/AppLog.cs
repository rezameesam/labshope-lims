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

    /// <summary>
    /// Records an error that stopped the app before it could even start (so the normal log was not running yet) in <c>startup-error.log</c>
    /// next to the other logs, or in the temp folder if that folder cannot be used. Also writes it to the console. Never throws.
    /// </summary>
    public static string? WriteStartupFailure(Exception ex, string? directory = null)
    {
        var text = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} STARTUP FAILURE ({Environment.OSVersion}, {System.Runtime.InteropServices.RuntimeInformation.OSArchitecture}){Environment.NewLine}{ex}{Environment.NewLine}";
        try { Console.Error.WriteLine(text); } catch { /* no console */ }
        foreach (var dir in new[] { directory, Path.Combine(DataFolder.Current(), "logs"), Path.GetTempPath() })
        {
            if (string.IsNullOrEmpty(dir)) continue;
            try
            {
                System.IO.Directory.CreateDirectory(dir);
                var file = Path.Combine(dir, "startup-error.log");
                File.AppendAllText(file, text);
                return file;
            }
            catch { /* try the next place */ }
        }
        return null;
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
