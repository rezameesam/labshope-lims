using System;
using System.IO;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using LabShope.Core.Data;
using LabShope.Core.Sync;
using LabShope.Core.Scanning;

namespace LabShope.App;

public partial class MainWindow : Window
{
    private readonly AppSession _session;
    private readonly LocalStore _store;
    private readonly ScanDetector _scanner = new();
    private PatientRegisterView? _patients;
    private BillsView? _bills;
    private RegisterVisitView? _register;
    private bool _syncing;

    public MainWindow() => throw new InvalidOperationException("Use the constructor with a session.");

    public MainWindow(AppSession session)
    {
        _session = session;
        _store = session.Store;
        InitializeComponent();
        LabText.Text = session.Workspace.OrganizationName;
        Title = $"LabShope LIMS - {session.Workspace.OrganizationName}";

        var clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        clock.Tick += (_, _) => ClockText.Text = DateTime.Now.ToString("dd MMM yyyy  HH:mm:ss");
        clock.Start();

        // A barcode scan works from anywhere in the app.
        AddHandler(KeyDownEvent, OnKeyDown, RoutingStrategies.Tunnel);

        OnOpenPatients(null, null!);

        // Sync when the app opens and then every minute.
        var syncTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(60) };
        syncTimer.Tick += async (_, _) => await SyncAsync();
        syncTimer.Start();
        Opened += async (_, _) => await SyncAsync();

        Shot.Attach(this);
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyModifiers is not (KeyModifiers.None or KeyModifiers.Shift)) return;
        var key = e.Key switch { Key.Enter or Key.Return => "Enter", Key.Tab => "Tab", _ => e.KeySymbol ?? "" };
        var code = _scanner.Push(key, Environment.TickCount64);
        if (code is null) return;

        e.Handled = true;
        var match = _store.ResolveScan(code);
        switch (match)
        {
            case ScanMatch.FoundPatient found: ShowScanned(found.Patient); break;
            case ScanMatch.FoundInvoice { Patient: not null } bill: ShowScanned(bill.Patient); break;
            default: ScanText.Text = $"No patient or bill found for \"{code}\""; break;
        }
    }

    private void ShowScanned(Patient patient)
    {
        if (_register is not null && Windows.SelectedItem is TabItem { Content: var current } && current == _register)
        {
            _register.UsePatient(patient);
            ScanText.Text = $"Scanned: {patient.FullName} ({patient.PatientCode})";
            return;
        }

        OnOpenPatients(null, null!);
        _patients!.ShowPatient(patient);
        ScanText.Text = $"Scanned: {patient.FullName} ({patient.PatientCode})";
    }

    private void OnOpenPatients(object? sender, RoutedEventArgs e)
    {
        if (_patients is null)
        {
            _patients = new PatientRegisterView(_store);
            Windows.Items.Add(new TabItem { Header = "Patient Register", Content = _patients });
        }
        Windows.SelectedIndex = Windows.Items.Count - 1;
        _patients.FocusSearch();
    }

    private void OnOpenRegister(object? sender, RoutedEventArgs e)
    {
        if (_register is null)
        {
            _register = new RegisterVisitView(_session);
            _register.Registered += async () => { _patients?.Refresh(); await SyncAsync(); };
            Windows.Items.Add(new TabItem { Header = "Register visit", Content = _register });
        }
        Windows.SelectedIndex = Windows.Items.IndexOf(Windows.Items.OfType<TabItem>().First(t => t.Content == _register));
        _register.FocusFirstField();
    }

    private void OnOpenBills(object? sender, RoutedEventArgs e)
    {
        if (_bills is null)
        {
            _bills = new BillsView(_store);
            Windows.Items.Add(new TabItem { Header = "Bills", Content = _bills });
        }
        Windows.SelectedIndex = Windows.Items.IndexOf(Windows.Items.OfType<TabItem>().First(t => t.Content == _bills));
        _bills.Refresh();
    }

    private async void OnSync(object? sender, RoutedEventArgs e) => await SyncAsync();

    private async Task SyncAsync()
    {
        if (_syncing) return;
        _syncing = true;
        StatusText.Text = "Syncing…";
        try
        {
            var status = await _session.Sync.RunOnceAsync();
            var waiting = status.Pending > 0 ? $"  |  {status.Pending} waiting to send" : "";
            var failed = status.Failed > 0 ? $"  |  {status.Failed} need attention" : "";
            StatusText.Text = status.NeedsSignIn ? "Please sign in again (File > Sign out)"
                : status.Online ? $"Online, synced {DateTime.Now:HH:mm}{waiting}{failed}"
                : $"Offline: working from this computer{waiting}";
            _patients?.Refresh();
            _bills?.Refresh();
            _register?.ReloadCatalog();
        }
        finally { _syncing = false; }
    }

    private void OnSignOut(object? sender, RoutedEventArgs e)
    {
        _session.Account.SignOut();
        Close();
    }

    private void OnExit(object? sender, RoutedEventArgs e) => Close();
    private void OnAbout(object? sender, RoutedEventArgs e) => StatusText.Text = "LabShope LIMS (native preview)";


}
