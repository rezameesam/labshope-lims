using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class PatientDialog : Window
{
    private readonly PatientService _service;
    private readonly Patient _patient;

    /// <summary>The patient after saving, or null when cancelled.</summary>
    public Patient? Result { get; private set; }

    public PatientDialog() => throw new InvalidOperationException("Use the constructor with a patient.");

    public PatientDialog(PatientService service, Patient patient)
    {
        _service = service;
        _patient = patient;
        InitializeComponent();
        Heading.Text = $"{patient.FullName}  ({patient.PatientCode})";
        NameBox.Text = patient.FullName;
        PhoneBox.Text = patient.Phone;
        DobBox.Text = patient.DateOfBirth;
        GenderBox.SelectedIndex = patient.Gender switch { "male" => 1, "female" => 2, "other" => 3, _ => 0 };
        Opened += (_, _) => { NameBox.Focus(); NameBox.SelectAll(); };
    }

    private void OnSave(object? sender, RoutedEventArgs e)
    {
        try
        {
            var gender = GenderBox.SelectedIndex > 0 ? (GenderBox.SelectedItem as ComboBoxItem)?.Content?.ToString() : null;
            Result = _service.Edit(_patient.Id, new PatientEdit(NameBox.Text ?? "", PhoneBox.Text ?? "", gender, DobBox.Text));
            Close();
        }
        catch (ArgumentException ex) { ErrorText.Text = ex.Message; ErrorText.IsVisible = true; }
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
