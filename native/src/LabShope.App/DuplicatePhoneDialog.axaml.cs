using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;

namespace LabShope.App;

public enum DuplicateChoiceKind { Cancel, UseExisting, CreateNew }

public sealed record DuplicateChoice(DuplicateChoiceKind Kind, Patient? Patient = null);

/// <summary>
/// The website's "phone number already registered" warning: the number is common to family members, so staff may use the existing
/// patient or carry on with a new one.
/// </summary>
public partial class DuplicatePhoneDialog : Window
{
    private sealed record Row(Patient Patient)
    {
        public override string ToString() => $"{Patient.FullName}   {Patient.PatientCode}" + (Patient.DateOfBirth is null ? "" : $"   born {Patient.DateOfBirth}") + (Patient.Gender is null ? "" : $"   {Patient.Gender}");
    }

    public DuplicateChoice Result { get; private set; } = new(DuplicateChoiceKind.Cancel);

    public DuplicatePhoneDialog() : this([], "") { }

    public DuplicatePhoneDialog(IReadOnlyList<Patient> matches, string phone)
    {
        InitializeComponent();
        Detail.Text = $"{phone} is already registered with {matches.Count} patient{(matches.Count == 1 ? "" : "s")}. This is common when family members " +
                      "(for example children or elderly relatives) share one contact number.";
        Matches.ItemsSource = matches.Select(p => new Row(p)).ToList();
        if (matches.Count > 0) Matches.SelectedIndex = 0;
    }

    private void OnUse(object? sender, RoutedEventArgs e)
    {
        if (Matches.SelectedItem is Row row) { Result = new(DuplicateChoiceKind.UseExisting, row.Patient); Close(); }
    }

    private void OnCreateNew(object? sender, RoutedEventArgs e) { Result = new(DuplicateChoiceKind.CreateNew); Close(); }
    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
