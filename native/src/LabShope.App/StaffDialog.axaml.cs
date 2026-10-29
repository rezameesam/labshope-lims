using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class StaffDialog : Window
{
    private sealed record RoleChoice(string Value, string Label);

    private readonly SupabaseApi _api;
    private readonly string _organizationId;

    /// <summary>True when the account was created.</summary>
    public bool Saved { get; private set; }

    public StaffDialog() => throw new InvalidOperationException("Use the constructor with the lab details.");

    public StaffDialog(SupabaseApi api, string organizationId, IReadOnlyList<LabRef> labs, string? currentLabId)
    {
        _api = api;
        _organizationId = organizationId;
        InitializeComponent();
        RoleBox.ItemsSource = new[] { new RoleChoice("employee", "Employee (front desk and lab)"), new RoleChoice("collector", "Collector (sample collection)"), new RoleChoice("admin", "Admin (everything)") };
        RoleBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(RoleChoice.Label));
        RoleBox.SelectedIndex = 0;
        LabBox.ItemsSource = labs;
        LabBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(LabRef.Name));
        LabBox.SelectedItem = labs.FirstOrDefault(l => l.Id == currentLabId) ?? labs.FirstOrDefault();
        Opened += (_, _) => NameBox.Focus();
    }

    private void OnToggleEye(object? sender, RoutedEventArgs e)
    {
        var show = PasswordEye.IsChecked == true;
        PasswordBox.RevealPassword = show;
        PasswordEyeIcon.Kind = show ? Material.Icons.MaterialIconKind.EyeOffOutline : Material.Icons.MaterialIconKind.EyeOutline;
        PasswordBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var role = RoleBox.SelectedItem is RoleChoice r ? r.Value : "";
        var result = await TeamService.AddAsync(_api, _organizationId, new TeamService.NewStaff(NameBox.Text ?? "", EmailBox.Text ?? "", PasswordBox.Text ?? "", role,
            PhoneBox.Text ?? "", DesignationBox.Text ?? "", DepartmentBox.Text ?? "", (LabBox.SelectedItem as LabRef)?.Id));
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
