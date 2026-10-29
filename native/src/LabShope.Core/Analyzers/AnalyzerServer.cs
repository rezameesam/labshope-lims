using System.IO.Ports;
using System.Net;
using System.Net.Sockets;

namespace LabShope.Core.Analyzers;

/// <summary>Runs one conversation over any byte stream (a network connection or a serial cable) until it closes.</summary>
public static class InstrumentChannel
{
    public static async Task RunAsync(Stream stream, InstrumentSession session, CancellationToken ct)
    {
        var buffer = new byte[4096];
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var read = await stream.ReadAsync(buffer, ct);
                if (read == 0) break; // the machine closed the connection
                var reply = session.Feed(buffer.AsSpan(0, read));
                if (reply.Length > 0) { await stream.WriteAsync(reply, ct); await stream.FlushAsync(ct); }
            }
        }
        catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException or InvalidOperationException or TimeoutException) { }
    }
}

/// <summary>
/// Listens on a network port for analyzers that connect to the computer (the common setup: the machine is configured with this
/// computer's address and a port). Several machines can connect at once. Results arrive on a background thread.
/// </summary>
public sealed class AnalyzerServer : IDisposable
{
    private readonly TcpListener _listener;
    private readonly CancellationTokenSource _stop = new();
    private Task? _loop;

    public event Action<InstrumentResult>? ResultReceived;
    public event Action<string>? Log;

    /// <summary>The port actually listening (useful when 0 was asked for).</summary>
    public int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;

    /// <summary>When set, only these addresses may connect (the analyzers). Empty means anyone on the network, as most machines are simply plugged into the lab's network.</summary>
    public IReadOnlyCollection<IPAddress> AllowedAddresses { get; set; } = [];

    /// <summary>A lab has a handful of machines; more connections than this are turned away.</summary>
    public const int MaxConnections = 16;
    private int _connections;

    public AnalyzerServer(int port) => _listener = new TcpListener(IPAddress.Any, port);

    public void Start()
    {
        _listener.Start();
        Log?.Invoke($"Listening for analyzers on port {Port}.");
        _loop = Task.Run(AcceptLoopAsync);
    }

    private async Task AcceptLoopAsync()
    {
        while (!_stop.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(_stop.Token); }
            catch (Exception ex) when (ex is OperationCanceledException or ObjectDisposedException or SocketException) { break; }
            if (!Allowed(client) || Interlocked.Increment(ref _connections) > MaxConnections)
            {
                if (Allowed(client)) Interlocked.Decrement(ref _connections);
                Log?.Invoke($"Refused a connection from {client.Client.RemoteEndPoint}.");
                client.Dispose();
                continue;
            }
            _ = Task.Run(() => HandleAsync(client));
        }
    }

    private bool Allowed(TcpClient client) =>
        AllowedAddresses.Count == 0 || (client.Client.RemoteEndPoint as IPEndPoint)?.Address is { } a && AllowedAddresses.Any(x => x.Equals(a) || x.MapToIPv6().Equals(a.MapToIPv6()));

    private async Task HandleAsync(TcpClient client)
    {
        using (client)
        {
            Log?.Invoke($"Analyzer connected from {client.Client.RemoteEndPoint}.");
            var session = new AutoSession();
            session.ResultsReceived += results => { foreach (var r in results) ResultReceived?.Invoke(r); };
            await InstrumentChannel.RunAsync(client.GetStream(), session, _stop.Token);
            Interlocked.Decrement(ref _connections);
            Log?.Invoke("Analyzer disconnected.");
        }
    }

    public void Dispose()
    {
        _stop.Cancel();
        _listener.Stop();
        try { _loop?.Wait(1000); } catch { }
        _stop.Dispose();
    }
}

/// <summary>Reads an analyzer connected by a serial (COM) cable. Same protocols as the network listener.</summary>
public sealed class SerialAnalyzer : IDisposable
{
    private readonly SerialPort _port;
    private readonly CancellationTokenSource _stop = new();
    private Task? _loop;

    public event Action<InstrumentResult>? ResultReceived;
    public event Action<string>? Log;

    public SerialAnalyzer(string portName, int baudRate = 9600, int dataBits = 8, Parity parity = Parity.None, StopBits stopBits = StopBits.One)
        => _port = new SerialPort(portName, baudRate, parity, dataBits, stopBits) { ReadTimeout = Timeout.Infinite, WriteTimeout = 3000 };

    /// <summary>The serial ports this computer has (for the settings screen).</summary>
    public static string[] AvailablePorts() { try { return SerialPort.GetPortNames(); } catch { return []; } }

    public void Start()
    {
        _port.Open();
        Log?.Invoke($"Reading analyzer on {_port.PortName} at {_port.BaudRate} baud.");
        var session = new AutoSession();
        session.ResultsReceived += results => { foreach (var r in results) ResultReceived?.Invoke(r); };
        _loop = Task.Run(() => InstrumentChannel.RunAsync(_port.BaseStream, session, _stop.Token));
    }

    public void Dispose()
    {
        _stop.Cancel();
        try { _port.Close(); } catch { }
        try { _loop?.Wait(1000); } catch { }
        _port.Dispose();
        _stop.Dispose();
    }
}
