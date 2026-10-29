namespace LabShope.Core.Scanning;

/// <summary>
/// Tells a barcode scanner from a person typing. Keyboard-style scanners type a code very fast
/// and finish with Enter (or Tab); a person is far slower. Same rules as the web app's detector.
/// </summary>
public sealed class ScanDetector
{
    private readonly int _maxGapMs;
    private readonly int _minLength;
    private readonly System.Text.StringBuilder _buffer = new();
    private long _lastTime;

    public ScanDetector(int maxGapMs = 40, int minLength = 4)
    {
        _maxGapMs = maxGapMs;
        _minLength = minLength;
    }

    /// <summary>Feed every key press. Returns the scanned code when Enter/Tab closes a fast burst, otherwise null.</summary>
    public string? Push(string key, long timeMs)
    {
        if (key is "Enter" or "Tab")
        {
            var code = _buffer.ToString();
            Reset();
            return code.Length >= _minLength ? code : null;
        }

        if (key.Length != 1) return null; // Shift, Control, arrows...

        if (_buffer.Length > 0 && timeMs - _lastTime > _maxGapMs) _buffer.Clear(); // a pause means a person
        _buffer.Append(key);
        _lastTime = timeMs;
        return null;
    }

    public void Reset() => _buffer.Clear();
}
