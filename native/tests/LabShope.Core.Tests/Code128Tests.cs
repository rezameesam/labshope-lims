using LabShope.Core.Scanning;

namespace LabShope.Core.Tests;

public class Code128Tests
{
    [Fact]
    public void MatchesTheKnownSymbolsForTheStandardExample()
    {
        // Start B (104), then each character minus 32, then the checksum: (104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7) % 103 = 55.
        Assert.Equal([104, 48, 42, 42, 17, 18, 19, 35, 55, 106], Code128.Symbols("PJJ123C"));
    }

    [Fact]
    public void TheBarPatternTableIsStructurallyValid()
    {
        var table = (string[])typeof(Code128).GetField("Patterns", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!.GetValue(null)!;
        Assert.Equal(107, table.Length);
        for (var i = 0; i < table.Length; i++)
        {
            var expectedLength = i == 106 ? 7 : 6;                       // the stop symbol has an extra closing bar
            Assert.Equal(expectedLength, table[i].Length);
            Assert.Equal(i == 106 ? 13 : 11, table[i].Sum(c => c - '0')); // every symbol is 11 modules wide (stop: 13)
            Assert.All(table[i], c => Assert.InRange(c, '1', '4'));       // bars and spaces are 1-4 modules
        }
        Assert.Equal(107, table.Distinct().Count());                       // no two symbols alike
    }

    [Fact]
    public void ChecksumIsTheWeightedSumModulo103()
    {
        var symbols = Code128.Symbols("IRM-0007");
        var sum = 104 + symbols.Skip(1).Take(8).Select((v, i) => v * (i + 1)).Sum();
        Assert.Equal(sum % 103, symbols[^2]);
        Assert.Equal(106, symbols[^1]);
    }

    [Fact]
    public void EverySymbolOccupiesElevenModulesAndTheStopThirteen()
    {
        // Total modules = 11 per symbol + 2 for the stop's extra bar. Check via the SVG width.
        var text = "AB12";
        var symbols = Code128.Symbols(text);
        var svg = Code128.ToSvg(text, moduleWidth: 1);
        var width = int.Parse(System.Text.RegularExpressions.Regex.Match(svg, @"width=""(\d+)""").Groups[1].Value);
        Assert.Equal(11 * (symbols.Count - 1) + 13 + 20, width);
    }

    [Fact]
    public void RefusesTextItCannotEncode()
    {
        Assert.False(Code128.CanEncode(""));
        Assert.False(Code128.CanEncode("café"));
        Assert.Throws<ArgumentException>(() => Code128.ToSvg("café"));
    }
}
