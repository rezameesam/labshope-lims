using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class CenterDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly string? _centerId;
    private readonly IReadOnlyList<LabRef> _labs;

    /// <summary>True when the server accepted the centre.</summary>
    public bool Saved { get; private set; }

    public CenterDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    public CenterDialog(SupabaseApi api, string organizationId, IReadOnlyList<LabRef> labs, string? defaultLabId, string? centerId, CenterInput? existing)
    {
        _api = api;
        _organizationId = organizationId;
        _centerId = centerId;
        _labs = labs;
        InitializeComponent();
        LabBox.ItemsSource = labs;
        LabBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(LabRef.Name));
        var lab = existing?.LabId ?? defaultLabId;
        LabBox.SelectedIndex = Math.Max(0, labs.ToList().FindIndex(l => l.Id == lab));
        if (existing is not null)
        {
            Heading.Text = "Edit collection centre";
            CodeBox.Text = existing.Code; NameBox.Text = existing.Name; AddressBox.Text = existing.Address; ContactBox.Text = existing.ContactPerson;
            PhoneBox.Text = existing.Phone; EmailBox.Text = existing.Email; ActiveBox.IsChecked = existing.Active;
        }
        Opened += (_, _) => CodeBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var input = new CenterInput((LabBox.SelectedItem as LabRef)?.Id ?? "", CodeBox.Text ?? "", NameBox.Text ?? "", AddressBox.Text ?? "", ContactBox.Text ?? "",
            PhoneBox.Text ?? "", EmailBox.Text ?? "", ActiveBox.IsChecked == true);
        var result = _centerId is null ? await OrgAdmin.AddCenterAsync(_api, _organizationId, input) : await OrgAdmin.UpdateCenterAsync(_api, _organizationId, _centerId, input);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
