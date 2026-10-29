namespace LabShope.Core.Analyzers;

/// <summary>One measured value reported by a lab machine (for example HGB 9.8 g/dL).</summary>
public sealed record InstrumentParameter(string Code, string Name, string Value, string? Unit, string? Reference, string? Flag)
{
    /// <summary>The machine's own abnormal flags (H, L, A, HH, LL, ...). N means normal.</summary>
    public bool FlaggedAbnormal => !string.IsNullOrWhiteSpace(Flag) && !Flag!.Trim().Equals("N", StringComparison.OrdinalIgnoreCase);
}

/// <summary>Everything a machine sent for one sample.</summary>
public sealed record InstrumentResult(string SampleId, string Protocol, IReadOnlyList<InstrumentParameter> Parameters, string? PatientName = null);
