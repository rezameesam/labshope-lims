using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class ExternalLabDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly string? _labId;

    /// <summary>True when the server accepted the lab.</summary>
    public bool Saved { get; private set; }

    public ExternalLabDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    public ExternalLabDialog(SupabaseApi api, string organizationId, string? labId, ExternalLabInput? existing)
    {
        _api = api;
        _organizationId = organizationId;
        _labId = labId;
        InitializeComponent();
        if (existing is not null)
        {
            Heading.Text = "Edit external lab";
            NameBox.Text = existing.Name; CodeBox.Text = existing.Code; ContactBox.Text = existing.ContactPerson; PhoneBox.Text = existing.Phone;
            EmailBox.Text = existing.Email; AddressBox.Text = existing.Address; GstBox.Text = existing.GstNumber; NotesBox.Text = existing.Notes;
        }
        Opened += (_, _) => NameBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var input = new ExternalLabInput(NameBox.Text ?? "", CodeBox.Text ?? "", ContactBox.Text ?? "", PhoneBox.Text ?? "", EmailBox.Text ?? "", AddressBox.Text ?? "", GstBox.Text ?? "", NotesBox.Text ?? "");
        var result = _labId is null
            ? await CatalogManage.AddExternalLabAsync(_api, _organizationId, input)
            : await CatalogManage.UpdateExternalLabAsync(_api, _organizationId, _labId, input);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
