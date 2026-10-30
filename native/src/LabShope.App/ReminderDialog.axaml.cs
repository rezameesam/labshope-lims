using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Adds a patient reminder, or changes an existing one.</summary>
public partial class ReminderDialog : Window
{
    private readonly AppSession _session;
    private readonly Reminder? _editing;
    private Patient? _patient;

    /// <summary>True once the reminder was saved.</summary>
    public bool Saved { get; private set; }

    public ReminderDialog() => throw new InvalidOperationException("Use the constructor with a session.");

    public ReminderDialog(AppSession session, Reminder? editing = null, Patient? patient = null)
    {
        _session = session;
        _editing = editing;
        InitializeComponent();
        TypeBox.ItemsSource = Reminders.Types.Select(t => t.Replace('_', ' ')).ToList();
        TypeBox.SelectedIndex = editing is null ? 0 : Math.Max(0, Array.IndexOf(Reminders.Types, editing.Type));
        DateBox.Text = editing?.ReminderDate ?? DateTime.Today.AddDays(1).ToString("yyyy-MM-dd");
        DueBox.Text = editing?.DueDate ?? "";
        TitleBox.Text = editing?.Title ?? "";
        MessageBox.Text = editing?.Message ?? "";
        HeadText.Text = editing is null ? "New reminder" : "Change reminder";
        PatientSearch.TextChanged += (_, _) => SearchPatients();
        PatientResults.ItemTemplate = new Avalonia.Controls.Templates.FuncDataTemplate<Patient>((p, _) => new TextBlock { Text = $"{p.FullName}  ·  {p.PatientCode}  ·  {p.Phone}" });
        PatientResults.SelectionChanged += (_, _) => { if (PatientResults.SelectedItem is Patient p) Pick(p); };
        if (editing is not null) { PatientSearch.IsVisible = false; PatientResults.IsVisible = false; Pick(session.Store.GetPatient(editing.PatientId)); }
        else if (patient is not null) Pick(patient);
    }

    private void SearchPatients()
    {
        var text = PatientSearch.Text ?? "";
        PatientResults.ItemsSource = text.Trim().Length < 2 ? null : _session.Store.SearchPatients(text, 8).ToList();
    }

    private void Pick(Patient? patient)
    {
        _patient = patient;
        PickedText.Text = patient is null ? "" : $"{patient.FullName}  ·  {patient.PatientCode}";
        PickedText.IsVisible = patient is not null;
        PatientResults.ItemsSource = null;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();

    public async Task SaveAsync()
    {
        ErrorBox.IsVisible = false;
        if (_session.Api is null) { Fail("Reminders need an internet connection."); return; }
        SaveButton.IsEnabled = false;
        var result = await Reminders.SaveAsync(_session.Api, _session.Workspace.OrganizationId, _editing?.Id, _patient?.Id ?? "",
            Reminders.Types[Math.Max(0, TypeBox.SelectedIndex)], TitleBox.Text ?? "", MessageBox.Text ?? "", (DateBox.Text ?? "").Trim(), (DueBox.Text ?? "").Trim());
        SaveButton.IsEnabled = true;
        if (!result.Ok) { Fail(result.Error ?? "Could not save."); return; }
        Saved = true;
        Close();
    }

    private async void OnSave(object? sender, RoutedEventArgs e) => await SaveAsync();

    private void Fail(string text) { ErrorText.Text = text; ErrorBox.IsVisible = true; }
}
