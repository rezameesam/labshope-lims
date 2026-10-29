using System;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Account;

namespace LabShope.App;

public partial class LoginWindow : Window
{
    private readonly AccountService _account;

    public Workspace? Result { get; private set; }

    public LoginWindow() => throw new InvalidOperationException("Use the constructor with an account service.");

    public LoginWindow(AccountService account, string? lastEmail)
    {
        _account = account;
        InitializeComponent();
        Shot.Attach(this);
        EmailBox.Text = lastEmail;
        Opened += (_, _) => (string.IsNullOrEmpty(EmailBox.Text) ? EmailBox : PasswordBox).Focus();
    }

    private async void OnSignIn(object? sender, RoutedEventArgs e)
    {
        SignInButton.IsEnabled = false;
        SignInButton.Content = "Signing in…";
        ErrorText.IsVisible = false;

        // Second step: the account has several labs and one was picked.
        var result = LabChoice.SelectedItem is Workspace choice && ChoicePanel.IsVisible
            ? await _account.ChooseAsync(choice)
            : await _account.SignInAsync(EmailBox.Text ?? "", PasswordBox.Text ?? "");

        if (result.Ok && result.Workspace is not null)
        {
            Result = result.Workspace;
            Close();
            return;
        }

        if (result.Ok && result.Choices is { Count: > 0 } choices)
        {
            LabChoice.ItemsSource = choices;
            LabChoice.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(Workspace.OrganizationName));
            LabChoice.SelectedIndex = 0;
            ChoicePanel.IsVisible = true;
            SignInButton.IsEnabled = true;
            SignInButton.Content = "Continue";
            return;
        }

        ErrorText.Text = result.Error;
        ErrorText.IsVisible = true;
        SignInButton.IsEnabled = true;
        SignInButton.Content = "Sign in";
        PasswordBox.Text = "";
        PasswordBox.Focus();
    }
}
