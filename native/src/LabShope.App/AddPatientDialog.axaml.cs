using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class AddPatientDialog : Window
{
    private readonly SupabaseApi? _api;
    private readonly LocalStore _store;
    private readonly string _organizationId;
    private readonly string? _userId;

    /// <summary>The patient that was added, or null when cancelled.</summary>
    public Patient? Result { get; private set; }

    public AddPatientDialog() => throw new InvalidOperationException("Use the constructor with a session.");

    public AddPatientDialog(AppSession session)
    {
        _api = session.Api;
        _store = session.Store;
        _organizationId = session.Workspace.OrganizationId;
        _userId = session.Account.SavedUserId;
        InitializeComponent();
        DobBox.DisplayDateEnd = DateTime.Today;
        Opened += (_, _) => NameBox.Focus();
    }

    private static string? Choice(ComboBox box) => box.SelectedIndex > 0 ? (box.SelectedItem as ComboBoxItem)?.Content?.ToString() : null;

    private void OnSave(object? sender, RoutedEventArgs e) => Add(false);
    private void OnAddAnyway(object? sender, RoutedEventArgs e) => Add(true);

    private async void Add(bool allowDuplicate)
    {
        if (_api is null) { Show("Adding a patient on their own needs an internet connection. Use Register visit to add them offline."); return; }
        SaveButton.IsEnabled = false;
        try
        {
            var result = await PatientAdmin.AddAsync(_api, _store, _organizationId, _userId,
                new StandalonePatient(NameBox.Text ?? "", PhoneBox.Text ?? "", Choice(GenderBox), DobBox.SelectedDate?.ToString("yyyy-MM-dd"),
                    EmailBox.Text, AddressBox.Text, Choice(BloodBox), allowDuplicate));
            if (result.Ok) { Result = result.Patient; Close(); return; }
            var same = result.SamePhone is { Count: > 0 } list ? $" Already on this number: {string.Join(", ", list.Select(p => $"{p.FullName} ({p.PatientCode})"))}." : "";
            Show(result.Error + same);
            AnywayButton.IsVisible = result.SamePhone is { Count: > 0 };
        }
        finally { SaveButton.IsEnabled = true; }
    }

    private void Show(string? text) { ErrorText.Text = text; ErrorText.IsVisible = !string.IsNullOrEmpty(text); }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
