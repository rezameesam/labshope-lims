using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class LabDialog : Window
{
    private sealed record Parent(string? Id, string Name);

    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly LabFull? _lab;

    /// <summary>True when the server accepted the lab.</summary>
    public bool Saved { get; private set; }

    public LabDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    public LabDialog(SupabaseApi api, string organizationId, IReadOnlyList<LabRef> labs, LabFull? existing)
    {
        _api = api;
        _organizationId = organizationId;
        _lab = existing;
        InitializeComponent();
        var parents = new[] { new Parent(null, "(none)") }.Concat(labs.Where(l => l.Id != existing?.Id).Select(l => new Parent(l.Id, $"{l.Name} ({l.LabCode})"))).ToList();
        ParentBox.ItemsSource = parents;
        ParentBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(Parent.Name));
        ParentBox.SelectedIndex = 0;
        if (existing is not null)
        {
            Heading.Text = "Edit lab";
            var l = existing.Input;
            CodeBox.Text = l.Code; NameBox.Text = l.Name; AddressBox.Text = l.Address; CityBox.Text = l.City; StateBox.Text = l.State;
            PincodeBox.Text = l.Pincode; PhoneBox.Text = l.Phone; EmailBox.Text = l.Email; LatBox.Text = l.Latitude; LonBox.Text = l.Longitude;
            AbdmBox.IsChecked = l.AbdmEnabled; FacilityBox.Text = l.AbdmFacilityId; ActiveBox.IsChecked = l.Active;
            TypeBox.SelectedIndex = Math.Max(0, Array.IndexOf(OrgAdmin.LabTypes, l.Type));
            var at = parents.FindIndex(p => p.Id == l.ParentLabId);
            ParentBox.SelectedIndex = at < 0 ? 0 : at;
        }
        Opened += (_, _) => CodeBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var type = (TypeBox.SelectedItem as ComboBoxItem)?.Tag as string ?? "main";
        var input = new LabInput(CodeBox.Text ?? "", NameBox.Text ?? "", type, (ParentBox.SelectedItem as Parent)?.Id, AddressBox.Text ?? "", CityBox.Text ?? "",
            StateBox.Text ?? "", PincodeBox.Text ?? "", PhoneBox.Text ?? "", EmailBox.Text ?? "", ActiveBox.IsChecked == true, LatBox.Text ?? "", LonBox.Text ?? "",
            AbdmBox.IsChecked == true, FacilityBox.Text ?? "");
        var result = _lab is null ? await OrgAdmin.AddLabAsync(_api, _organizationId, input) : await OrgAdmin.UpdateLabAsync(_api, _organizationId, _lab, input);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
