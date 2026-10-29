using LabShope.Core.Scanning;

namespace LabShope.Core.Tests;

public class ScanDetectorTests
{
    private static string? Type(ScanDetector d, string text, long start, int gap, string end = "Enter")
    {
        var t = start;
        foreach (var ch in text) { d.Push(ch.ToString(), t); t += gap; }
        return d.Push(end, t);
    }

    [Fact] public void FastBurstEndedByEnterIsAScan() => Assert.Equal("IRM-00123", Type(new ScanDetector(), "IRM-00123", 0, 8));
    [Fact] public void TabAlsoEndsAScan() => Assert.Equal("INV20260001", Type(new ScanDetector(), "INV20260001", 0, 5, "Tab"));
    [Fact] public void SlowTypingIsNotAScan() => Assert.Null(Type(new ScanDetector(), "ravi kumar", 0, 150));
    [Fact] public void TooShortIsNotAScan() => Assert.Null(Type(new ScanDetector(), "ab", 0, 5));

    [Fact]
    public void ModifierKeysAreIgnoredMidScan()
    {
        var d = new ScanDetector();
        d.Push("A", 0); d.Push("Shift", 4);
        d.Push("B", 8); d.Push("C", 13); d.Push("D", 18);
        Assert.Equal("ABCD", d.Push("Enter", 30));
    }

    [Fact]
    public void StartsCleanAfterEachScan()
    {
        var d = new ScanDetector();
        Type(d, "FIRST1", 0, 5);
        Assert.Equal("SECOND2", Type(d, "SECOND2", 100, 5));
    }
}
