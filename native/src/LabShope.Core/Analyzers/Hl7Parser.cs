namespace LabShope.Core.Analyzers;

/// <summary>
/// Reads HL7 v2 result messages (ORU^R01), which many hematology analyzers send. The sample id is taken from the order segment
/// (placer or filler number), falling back to the patient identifier. Results are the OBX segments.
/// </summary>
public static class Hl7Parser
{
    public static IReadOnlyList<InstrumentResult> Parse(string message)
    {
        var segments = message.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim('\u000B', '\u001C')).Where(s => s.Length > 3).ToList();
        var msh = segments.FirstOrDefault(s => s.StartsWith("MSH", StringComparison.Ordinal));
        var fieldSep = msh is { Length: > 3 } ? msh[3] : '|';
        var componentSep = msh is { Length: > 4 } && msh.Split(fieldSep).ElementAtOrDefault(1) is { Length: > 0 } enc ? enc[0] : '^';

        string? sample = null, patientId = null, patientName = null;
        var parameters = new List<InstrumentParameter>();
        var results = new List<InstrumentResult>();

        void Flush()
        {
            var id = sample is { Length: > 0 } ? sample : patientId;
            if (id is { Length: > 0 } && parameters.Count > 0) results.Add(new InstrumentResult(id, "HL7", parameters.ToList(), patientName));
            parameters.Clear(); sample = null;
        }

        foreach (var segment in segments)
        {
            var f = segment.Split(fieldSep);
            switch (f[0])
            {
                case "PID":
                    patientId = f.Length > 3 ? First(f[3], componentSep) : null;
                    if (f.Length > 5) { var n = f[5].Split(componentSep); patientName = string.Join(" ", new[] { n.ElementAtOrDefault(1), n[0] }.Where(x => !string.IsNullOrWhiteSpace(x))).Trim(); } // Family^Given -> "Given Family"
                    break;
                case "OBR":
                    Flush();
                    // OBR-2 placer order number, OBR-3 filler order number; analyzers put the sample barcode in one of them.
                    sample = f.Length > 3 && First(f[3], componentSep) is { Length: > 0 } filler ? filler : f.Length > 2 ? First(f[2], componentSep) : null;
                    break;
                case "OBX":
                    if (f.Length > 5 && !string.IsNullOrWhiteSpace(f[5]))
                    {
                        var parts = f[3].Split(componentSep);
                        var code = parts[0].Trim();
                        var name = parts.Length > 1 && !string.IsNullOrWhiteSpace(parts[1]) ? parts[1].Trim() : code;
                        parameters.Add(new InstrumentParameter(code, name, f[5].Trim(), Clean(f.ElementAtOrDefault(6)), Clean(f.ElementAtOrDefault(7)), Clean(f.ElementAtOrDefault(8))));
                    }
                    break;
            }
        }
        Flush();
        return results;
    }

    /// <summary>The acknowledgement a machine expects after a message (MSA|AA = accepted).</summary>
    public static string BuildAck(string message, DateTimeOffset now)
    {
        var msh = message.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault(s => s.TrimStart('\u000B').StartsWith("MSH", StringComparison.Ordinal))?.TrimStart('\u000B') ?? "MSH|^~\\&|";
        var f = msh.Split('|');
        var controlId = f.Length > 9 ? f[9] : "";
        var sendingApp = f.Length > 2 ? f[2] : "";
        var sendingFacility = f.Length > 3 ? f[3] : "";
        var version = f.Length > 11 && f[11].Length > 0 ? f[11] : "2.3.1";
        return $"MSH|^~\\&|LABSHOPE|LAB|{sendingApp}|{sendingFacility}|{now:yyyyMMddHHmmss}||ACK^R01|{controlId}|P|{version}\rMSA|AA|{controlId}\r";
    }

    private static string First(string field, char componentSep) => field.Split(componentSep)[0].Trim();
    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
