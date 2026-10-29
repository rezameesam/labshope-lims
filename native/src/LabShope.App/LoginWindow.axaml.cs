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
        Opened += (_, _) => (string.IsNullOrEmpty(LabBox.Text) ? LabBox : PasswordBox).Focus();
    }

    private async void OnSignIn(object? sender, RoutedEventArgs e)
    {
        SignInButton.IsEnabled = false;
        SignInButton.Content = "Signing in…";
        ErrorText.IsVisible = false;

        var result = await _account.SignInAsync(LabBox.Text ?? "", EmailBox.Text ?? "", PasswordBox.Text ?? "");

        if (result.Ok)
        {
            Result = result.Workspace;
            Close();
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
