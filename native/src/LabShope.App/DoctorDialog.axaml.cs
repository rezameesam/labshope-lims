using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class DoctorDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly string? _doctorId;

    /// <summary>True when the server accepted the doctor.</summary>
    public bool Saved { get; private set; }

    public DoctorDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    /// <summary>A new doctor (<paramref name="existing"/> is null) or an edit of one read from the server.</summary>
    public DoctorDialog(SupabaseApi api, string organizationId, DoctorFull? existing)
    {
        _api = api;
        _organizationId = organizationId;
        _doctorId = existing?.Id;
        InitializeComponent();
        if (existing is not null)
        {
            Heading.Text = "Edit doctor";
            var d = existing.Input;
            NameBox.Text = d.Name; SpecBox.Text = d.Specialization; PhoneBox.Text = d.Phone; CommissionBox.Text = d.Commission;
            EmailBox.Text = d.Email; AddressBox.Text = d.Address; NotesBox.Text = d.Notes; ActiveBox.IsChecked = d.Active;
        }
        Opened += (_, _) => NameBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var input = new DoctorInput(NameBox.Text ?? "", SpecBox.Text ?? "", PhoneBox.Text ?? "", EmailBox.Text ?? "", AddressBox.Text ?? "",
            CommissionBox.Text ?? "", ActiveBox.IsChecked == true, NotesBox.Text ?? "");
        var result = _doctorId is null
            ? await CatalogManage.AddDoctorAsync(_api, _organizationId, input)
            : await CatalogManage.UpdateDoctorAsync(_api, _organizationId, _doctorId, input);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
