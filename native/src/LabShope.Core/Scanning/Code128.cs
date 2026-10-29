using System.Text;

namespace LabShope.Core.Scanning;

/// <summary>Code 128 (subset B) barcodes as SVG: plain text in, a sharp printable barcode out. Reads on every normal scanner.</summary>
public static class Code128
{
    // Bar/space widths for symbols 0..106 (index = symbol value). 6 digits each, bars and spaces alternating.
    private static readonly string[] Patterns =
    [
        "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222",
        "123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321",
        "232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
        "313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224",
        "111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
        "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
        "114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
    ];

    private const int StartB = 104, Stop = 106;

    /// <summary>True when every character can be written in Code 128 subset B (printable ASCII).</summary>
    public static bool CanEncode(string text) => text.Length > 0 && text.All(c => c is >= ' ' and <= '~');

    /// <summary>The symbol values for the text, including start, checksum and stop.</summary>
    public static IReadOnlyList<int> Symbols(string text)
    {
        if (!CanEncode(text)) throw new ArgumentException("Only printable ASCII can be encoded.", nameof(text));
        var values = new List<int> { StartB };
        values.AddRange(text.Select(c => c - 32));
        var sum = StartB;
        for (var i = 1; i < values.Count; i++) sum += values[i] * i;
        values.Add(sum % 103);
        values.Add(Stop);
        return values;
    }

    /// <summary>The barcode as an SVG (black bars, 10 modules of quiet zone each side).</summary>
    public static string ToSvg(string text, int moduleWidth = 2, int height = 60)
    {
        var x = 10 * moduleWidth;
        var bars = new StringBuilder();
        foreach (var symbol in Symbols(text))
        {
            var pattern = Patterns[symbol];
            for (var i = 0; i < pattern.Length; i++)
            {
                var w = (pattern[i] - '0') * moduleWidth;
                if (i % 2 == 0) bars.Append($"<rect x=\"{x}\" y=\"0\" width=\"{w}\" height=\"{height}\"/>");
                x += w;
            }
        }
        var total = x + 10 * moduleWidth;
        return $"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {total} {height}\" width=\"{total}\" height=\"{height}\" shape-rendering=\"crispEdges\" fill=\"#000\">{bars}</svg>";
    }
}
