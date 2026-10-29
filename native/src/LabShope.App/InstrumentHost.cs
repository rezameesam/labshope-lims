using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Avalonia.Threading;
using LabShope.Core;
using LabShope.Core.Analyzers;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>
/// Runs the connections to the lab's machines for this computer (a network listener and/or a serial cable) and hands what they send to the inbox.
/// Machines talk on background threads; everything that touches the database is moved to the window's thread first.
/// </summary>
public sealed class InstrumentHost : IDisposable
{
    private readonly AppSession _session;
    private AnalyzerServer? _network;
    private SerialAnalyzer? _serial;

    public string NetworkStatus { get; private set; } = "Off";
    public string SerialStatus { get; private set; } = "Off";

    /// <summary>Raised (on the window's thread) when a result arrives or the status changes.</summary>
    public event Action? Changed;

    public InstrumentHost(AppSession session) => _session = session;

    public static IReadOnlyList<string> LocalAddresses()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .SelectMany(n => n.GetIPProperties().UnicastAddresses)
                .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork).Select(a => a.Address.ToString()).ToList();
        }
        catch { return []; }
    }

    /// <summary>(Re)starts whatever the settings ask for, stopping what they no longer ask for.</summary>
    public void Apply(InstrumentSettings settings)
    {
        Stop();

        if (settings.NetworkEnabled)
        {
            try
            {
                _network = new AnalyzerServer(settings.NetworkPort);
                _network.ResultReceived += OnResult;
                _network.Log += m => AppLog.Info(m);
                _network.Start();
                NetworkStatus = $"Listening on port {settings.NetworkPort}";
            }
            catch (Exception ex) when (ex is SocketException or InvalidOperationException)
            {
                AppLog.Error("Could not start the network analyzer listener", ex);
                _network?.Dispose(); _network = null;
                NetworkStatus = $"Could not listen on port {settings.NetworkPort} (is another program using it?)";
            }
        }

        if (settings.SerialEnabled)
        {
            try
            {
                _serial = new SerialAnalyzer(settings.SerialPort, settings.SerialBaud);
                _serial.ResultReceived += OnResult;
                _serial.Log += m => AppLog.Info(m);
                _serial.Start();
                SerialStatus = $"Reading {settings.SerialPort} at {settings.SerialBaud} baud";
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException or ArgumentException)
            {
                AppLog.Error("Could not open the serial port", ex);
                _serial?.Dispose(); _serial = null;
                SerialStatus = $"Could not open {settings.SerialPort} (is it in use, or unplugged?)";
            }
        }
        Changed?.Invoke();
    }

    private void OnResult(InstrumentResult result) => Dispatcher.UIThread.Post(() =>
    {
        try
        {
            var inbox = new InstrumentInbox(_session.Store, _session.Workspace.OrganizationId, _session.Account.SavedUserId);
            var entry = inbox.Receive(result);
            // Optionally accept straight away, but only when the match is unambiguous (one patient, one waiting test).
            if (InstrumentSettings.Load(_session.Store).AutoAccept && entry.PatientId is not null && inbox.Candidates(entry).Count == 1)
                inbox.Accept(entry.Id);
        }
        catch (Exception ex) { AppLog.Error("Could not store a result from an analyzer", ex); }
        Changed?.Invoke();
    });

    public void Stop()
    {
        _network?.Dispose(); _network = null; NetworkStatus = "Off";
        _serial?.Dispose(); _serial = null; SerialStatus = "Off";
    }

    public void Dispose() => Stop();
}
