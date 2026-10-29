using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using LabShope.Core.Data;
using LabShope.Core.Scanning;

namespace LabShope.App;

public partial class MainWindow : Window
{
    private readonly LocalStore _store;
    private readonly ScanDetector _scanner = new();
    private PatientRegisterView? _patients;

    public MainWindow()
    {
        InitializeComponent();

        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LabShope");
        Directory.CreateDirectory(dir);
        _store = new LocalStore(Path.Combine(dir, "lims.db"));
        if (_store.PatientCount() == 0) SeedDemoData();

        var clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        clock.Tick += (_, _) => ClockText.Text = DateTime.Now.ToString("dd MMM yyyy  HH:mm:ss");
        clock.Start();

        // A barcode scan works from anywhere in the app.
        AddHandler(KeyDownEvent, OnKeyDown, RoutingStrategies.Tunnel);

        OnOpenPatients(null, null!);
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

    private void OnSync(object? sender, RoutedEventArgs e) => StatusText.Text = "Sync is not connected yet.";
    private void OnExit(object? sender, RoutedEventArgs e) => Close();
    private void OnAbout(object? sender, RoutedEventArgs e) => StatusText.Text = "LabShope LIMS (native preview)";

    private void SeedDemoData()
    {
        // Development only: placeholder rows until sync is connected.
        var names = new[] { "Asha Rao", "Ravi Kumar", "Meera Nair", "Imran Sheikh", "Priya Menon", "Arjun Das", "Fatima Khan", "Suresh Iyer" };
        for (var n = 0; n < names.Length; n++)
            _store.UpsertPatient(new Patient($"demo-{n}", $"IRM-{n + 1:0000}", names[n], $"98{n:00}000{n + 1:000}", n % 2 == 0 ? "female" : "male", null));
    }

    protected override void OnClosed(EventArgs e)
    {
        _store.Dispose();
        base.OnClosed(e);
    }
}
