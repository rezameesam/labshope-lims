using System.Text.Json;
using LabShope.Core.Data;

namespace LabShope.Core.Analyzers;

/// <summary>How this computer talks to the lab's machines. Kept per computer (the machines are plugged into specific PCs).</summary>
public sealed record InstrumentSettings(
    bool NetworkEnabled = false, int NetworkPort = 5000,
    bool SerialEnabled = false, string SerialPort = "", int SerialBaud = 9600,
    bool AutoAccept = false)
{
    private const string Key = "instrument_settings";

    public static InstrumentSettings Load(LocalStore store)
    {
        try { return store.GetMeta(Key) is { } json ? JsonSerializer.Deserialize<InstrumentSettings>(json) ?? new() : new(); }
        catch (JsonException) { return new(); }
    }

    public void Save(LocalStore store) => store.SetMeta(Key, JsonSerializer.Serialize(this));

    /// <summary>Null when the settings are usable, otherwise what is wrong in plain words.</summary>
    public string? Problem() =>
        NetworkEnabled && NetworkPort is < 1024 or > 65535 ? "Use a network port between 1024 and 65535."
        : SerialEnabled && string.IsNullOrWhiteSpace(SerialPort) ? "Pick the serial (COM) port the analyzer is connected to."
        : SerialEnabled && SerialBaud is < 300 or > 230400 ? "Enter the baud rate shown in the analyzer's settings (usually 9600)."
        : null;
}
