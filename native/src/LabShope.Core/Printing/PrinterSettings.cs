using System.Text.Json;
using LabShope.Core.Data;

namespace LabShope.Core.Printing;

public enum PrinterMode { Browser, Network, Serial }

/// <summary>Where receipts go on this computer. Kept per computer (the receipt printer is plugged into a specific PC).</summary>
public sealed record PrinterSettings(PrinterMode Mode = PrinterMode.Browser, string Host = "", int Port = 9100, string SerialPort = "", int SerialBaud = 9600, int Columns = EscPos.DefaultColumns)
{
    private const string Key = "printer_settings";

    public static PrinterSettings Load(LocalStore store)
    {
        try { return store.GetMeta(Key) is { } json ? JsonSerializer.Deserialize<PrinterSettings>(json) ?? new() : new(); }
        catch (JsonException) { return new(); }
    }

    public void Save(LocalStore store) => store.SetMeta(Key, JsonSerializer.Serialize(this));

    /// <summary>Null when usable, otherwise what is wrong in plain words.</summary>
    public string? Problem() => Mode switch
    {
        PrinterMode.Network when string.IsNullOrWhiteSpace(Host) => "Enter the printer's network address (for example 192.168.1.50).",
        PrinterMode.Network when Port is < 1 or > 65535 => "The printer port is usually 9100.",
        PrinterMode.Serial when string.IsNullOrWhiteSpace(SerialPort) => "Pick the serial (COM) port the printer is connected to.",
        PrinterMode.Serial when SerialBaud is < 1200 or > 230400 => "Enter the baud rate from the printer's settings (usually 9600).",
        _ when Columns is < 24 or > 80 => "Characters per line should be between 24 and 80 (42 for an 80 mm printer, 32 for 58 mm).",
        _ => null,
    };
}
