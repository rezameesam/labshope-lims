using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Avalonia.Controls;
using LabShope.Core.Data;

namespace LabShope.App;

public partial class PatientRegisterView : UserControl
{
    private readonly LocalStore _store;

    public PatientRegisterView() => throw new InvalidOperationException("Use the constructor with a store.");

    public PatientRegisterView(LocalStore store)
    {
        _store = store;
        InitializeComponent();
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

    public void FocusSearch() => SearchBox.Focus();
}
