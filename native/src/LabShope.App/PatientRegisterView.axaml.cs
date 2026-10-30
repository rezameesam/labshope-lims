using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Collections.Generic;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class PatientRegisterView : UserControl
{
    private readonly LocalStore _store;
    private readonly AppSession? _session;

    /// <summary>Raised when the user wants to register a visit for the selected patient.</summary>
    public event Action<Patient>? RegisterVisitRequested;

    /// <summary>Raised after a patient was edited so the window can send the change.</summary>
    public event Action? PatientEdited;

    public PatientRegisterView() => throw new InvalidOperationException("Use the constructor with a session.");

    public PatientRegisterView(AppSession session)
    {
        _session = session;
        _store = session.Store;
        InitializeComponent();
        Grid.DoubleTapped += (_, _) => OnEdit(null, null!);
        SearchBox.TextChanged += (_, _) => Refresh();
        InactiveBox.IsCheckedChanged += async (_, _) => { if (Inactive) await LoadInactiveAsync(); else Refresh(); };
        Grid.SelectionChanged += (_, _) => UpdateButtons();
        Refresh();
    }

    private IReadOnlyList<Patient> _inactive = [];

    public void Refresh()
    {
        if (InactiveBox.IsChecked == true)
        {
            var words = (SearchBox.Text ?? "").Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var shown = _inactive.Where(p => words.All(w => $"{p.FullName} {p.Phone} {p.PatientCode}".ToLowerInvariant().Contains(w))).ToList();
            Grid.ItemsSource = shown;
            CountText.Text = $"{shown.Count} switched off";
        }
        else
        {
            var rows = _store.SearchPatients(SearchBox.Text ?? "");
            Grid.ItemsSource = rows;
            CountText.Text = $"{rows.Count} shown of {_store.PatientCount()}";
        }
        UpdateButtons();
    }

    private bool Inactive => InactiveBox.IsChecked == true;

    private void UpdateButtons()
    {
        var has = Grid.SelectedItem is Patient;
        EditButton.IsEnabled = has && !Inactive;
        RegisterButton.IsEnabled = has && !Inactive;
        HistoryButton.IsEnabled = has && !Inactive;
        ActiveButton.IsEnabled = has;
        AddButton.IsEnabled = !Inactive;
        ActiveText.Text = Inactive ? "Switch on" : "Switch off";
    }

    /// <summary>Loads the switched-off patients from the server, then shows them.</summary>
    private async Task LoadInactiveAsync()
    {
        if (_session?.Api is null) { _inactive = []; Refresh(); CountText.Text = "Switched-off patients need an internet connection."; return; }
        CountText.Text = "Loading…";
        var (patients, error) = await PatientAdmin.LoadInactiveAsync(_session.Api, _session.Workspace.OrganizationId);
        _inactive = patients;
        Refresh();
        if (error is not null) CountText.Text = error;
    }

    private async void OnAdd(object? sender, RoutedEventArgs e)
    {
        if (_session is null) return;
        var dialog = new AddPatientDialog(_session);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Result is null) return;
        Refresh();
        ShowPatient(dialog.Result);
    }

    private async void OnHistory(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not Patient patient) return;
        await new PatientHistoryDialog(_store, patient).ShowDialog((Window)TopLevel.GetTopLevel(this)!);
    }

    private async void OnToggleActive(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not Patient patient || _session?.Api is null) { CountText.Text = "Changing a patient needs an internet connection."; return; }
        var result = await PatientAdmin.SetActiveAsync(_session.Api, _store, _session.Workspace.OrganizationId, patient, active: Inactive);
        if (!result.Ok) { CountText.Text = result.Error ?? "Not changed."; return; }
        if (Inactive) await LoadInactiveAsync(); else Refresh();
        PatientEdited?.Invoke();
    }

    public void ShowPatient(Patient patient)
    {
        SearchBox.Text = patient.PatientCode;
        Refresh();
        Grid.SelectedItem = (Grid.ItemsSource as IEnumerable<Patient>)?.FirstOrDefault(p => p.Id == patient.Id);
    }

    private async void OnEdit(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not Patient patient || _session is null) return;
        var dialog = new PatientDialog(new PatientService(_store, _session.Workspace.OrganizationId), patient);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Result is null) return;
        Refresh();
        PatientEdited?.Invoke();
    }

    private void OnRegisterVisit(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is Patient patient) RegisterVisitRequested?.Invoke(patient);
    }

    public void FocusSearch() => SearchBox.Focus();
}
