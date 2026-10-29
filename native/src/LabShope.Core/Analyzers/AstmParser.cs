using System.Text;

namespace LabShope.Core.Analyzers;

/// <summary>
/// Reads ASTM E1394 result messages (the format many hematology and chemistry analyzers send): H header, P patient, O order, R result, L end.
/// The sample id is the specimen id of the order record. Forgiving about missing fields.
/// </summary>
public static class AstmParser
{
    public static IReadOnlyList<InstrumentResult> Parse(string message)
    {
        var results = new List<InstrumentResult>();
        string? sample = null, patient = null;
        var parameters = new List<InstrumentParameter>();
        var fieldSep = '|'; var componentSep = '^';

        void Flush()
        {
            if (sample is { Length: > 0 } && parameters.Count > 0) results.Add(new InstrumentResult(sample, "ASTM", parameters.ToList(), patient));
            sample = null; patient = null; parameters.Clear();
        }

        foreach (var raw in message.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var line = raw.Trim('\0', '\u0002', '\u0003');
            if (line.Length < 2) continue;

            // Frame numbers can stick to the front of the record ("1H|..."); strip a leading digit before the record letter.
            if (char.IsDigit(line[0]) && line.Length > 1 && char.IsLetter(line[1])) line = line[1..];

            var type = char.ToUpperInvariant(line[0]);
            if (type == 'H' && line.Length >= 5) { fieldSep = line[1]; componentSep = line[3]; } // H|\^&| : field, repeat, component, escape
            var f = line.Split(fieldSep);

            switch (type)
            {
                case 'P':
                    Flush();
                    patient = f.Length > 5 ? Component(f[5], componentSep, 0) is { Length: > 0 } last ? string.Join(" ", new[] { Component(f[5], componentSep, 1), last }.Where(x => !string.IsNullOrWhiteSpace(x))) : null : null;
                    break;
                case 'O':
                    if (sample is not null && parameters.Count > 0) Flush(); // a second order without a new patient record
                    sample = (f.Length > 2 ? f[2] : "").Trim();
                    if (sample.Length == 0 && f.Length > 3) sample = Component(f[3], componentSep, 0);
                    break;
                case 'R':
                    if (f.Length > 3 && !string.IsNullOrWhiteSpace(f[3]))
                    {
                        // Universal test id: ^^^CODE^NAME (code is the 4th component; some machines put it in the 1st)
                        var id = f[2];
                        var code = Component(id, componentSep, 3) is { Length: > 0 } c ? c : Component(id, componentSep, 0);
                        var name = Component(id, componentSep, 4) is { Length: > 0 } n ? n : code;
                        parameters.Add(new InstrumentParameter(code, name, f[3].Trim(), Clean(f.ElementAtOrDefault(4)), Clean(f.ElementAtOrDefault(5)), Clean(f.ElementAtOrDefault(6))));
                    }
                    break;
                case 'L':
                    Flush();
                    break;
            }
        }
        Flush();
        return results;
    }

    private static string Component(string field, char sep, int index)
    {
        var parts = field.Split(sep);
        return index < parts.Length ? parts[index].Trim() : "";
    }

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    /// <summary>The two-letter frame checksum: the sum of the bytes from the frame number up to and including ETX/ETB, modulo 256, in hex.</summary>
    public static string Checksum(string frameBody)
    {
        var sum = 0;
        foreach (var b in Encoding.ASCII.GetBytes(frameBody)) sum = (sum + b) & 0xFF;
        return sum.ToString("X2");
    }
}
