using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class ResetPasswordDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly TeamMember _person;
    private readonly string _resetBaseUrl;

    public ResetPasswordDialog() => throw new InvalidOperationException("Use the constructor with a person.");

    public ResetPasswordDialog(SupabaseApi api, TeamMember person, string resetBaseUrl)
    {
        _api = api;
        _person = person;
        _resetBaseUrl = resetBaseUrl;
        InitializeComponent();
        Heading.Text = $"Reset password: {person.FullName}";
        CustomChoice.IsCheckedChanged += (_, _) => PasswordBox.IsEnabled = CustomChoice.IsChecked == true;
    }

    private async void OnReset(object? sender, RoutedEventArgs e)
    {
        ResetButton.IsEnabled = false;
        ErrorBox.IsVisible = ResultBox.IsVisible = false;
        var mode = CustomChoice.IsChecked == true ? TeamService.ResetMode.Custom : TempChoice.IsChecked == true ? TeamService.ResetMode.Temporary : TeamService.ResetMode.Email;
        var result = await TeamService.ResetPasswordAsync(_api, _person.Id, mode, PasswordBox.Text, _resetBaseUrl);
        if (!result.Ok)
        {
            ErrorText.Text = result.Error;
            ErrorBox.IsVisible = true;
            ResetButton.IsEnabled = true;
            return;
        }
        ResultText.Text = mode switch
        {
            TeamService.ResetMode.Temporary => $"Temporary password for {_person.FullName}. Write it down: it is shown only once.",
            TeamService.ResetMode.Custom => "The new password is set.",
            _ => $"A reset link was sent to {_person.Email}.",
        };
        TempBox.IsVisible = mode == TeamService.ResetMode.Temporary;
        TempBox.Text = result.TempPassword;
        ResultBox.IsVisible = true;
        CloseButton.Content = "Close";
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
