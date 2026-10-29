using System.IO.Ports;
using System.Net.Sockets;

namespace LabShope.Core.Printing;

public sealed record PrintOutcome(bool Ok, string? Error);

/// <summary>Sends printer commands straight to a receipt printer over the network (port 9100) or a serial cable.</summary>
public static class RawPrinter
{
    public static async Task<PrintOutcome> SendAsync(PrinterSettings settings, byte[] data, CancellationToken ct = default)
    {
        if (settings.Problem() is { } problem) return new(false, problem);
        try
        {
            switch (settings.Mode)
            {
                case PrinterMode.Network:
                    using (var tcp = new TcpClient())
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                        timeout.CancelAfter(TimeSpan.FromSeconds(4));
                        await tcp.ConnectAsync(settings.Host.Trim(), settings.Port, timeout.Token);
                        var stream = tcp.GetStream();
                        await stream.WriteAsync(data, timeout.Token);
                        await stream.FlushAsync(timeout.Token);
                    }
                    return new(true, null);

                case PrinterMode.Serial:
                    using (var port = new SerialPort(settings.SerialPort, settings.SerialBaud) { WriteTimeout = 4000 })
                    {
                        port.Open();
                        port.Write(data, 0, data.Length);
                        port.BaseStream.Flush();
                    }
                    return new(true, null);

                default:
                    return new(false, "Direct printing is not turned on.");
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return new(false, "The printer did not answer. Check that it is on and the address is right."); }
        catch (SocketException) { return new(false, "Can't reach the printer. Check that it is on, on the same network, and the address is right."); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException or TimeoutException or ArgumentException)
        {
            return new(false, "Can't use that serial port. Check the cable and the port name.");
        }
    }
}
