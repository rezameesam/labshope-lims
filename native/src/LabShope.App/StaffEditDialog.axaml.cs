using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class StaffEditDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly TeamMember _person;

    /// <summary>True when the server accepted the change.</summary>
    public bool Saved { get; private set; }

    public StaffEditDialog() => throw new InvalidOperationException("Use the constructor with a person.");

    public StaffEditDialog(SupabaseApi api, string organizationId, TeamMember person)
    {
        _api = api;
        _organizationId = organizationId;
        _person = person;
        InitializeComponent();
        EmailText.Text = person.Email ?? "";
        NameBox.Text = person.FullName; PhoneBox.Text = person.Phone; DesignationBox.Text = person.Designation; DepartmentBox.Text = person.Department;
        Opened += (_, _) => NameBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var result = await TeamService.UpdateAsync(_api, _organizationId, _person.Id,
            new TeamService.StaffEdit(NameBox.Text ?? "", PhoneBox.Text ?? "", DesignationBox.Text ?? "", DepartmentBox.Text ?? ""));
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
