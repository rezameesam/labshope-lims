using System;
using System.IO;
using System.Linq;
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
        Refresh();
    }

    public void Refresh()
    {
        var rows = _store.SearchPatients(SearchBox.Text ?? "");
        Grid.ItemsSource = rows;
        CountText.Text = $"{rows.Count} shown of {_store.PatientCount()}";
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
