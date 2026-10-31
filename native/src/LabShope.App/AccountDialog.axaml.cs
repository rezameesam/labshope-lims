using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Finance;

namespace LabShope.App;

/// <summary>Adds an account to the chart of accounts or changes one.</summary>
public partial class AccountDialog : Window
{
    private readonly AppSession _session;
    private readonly AccountInfo? _editing;

    public bool Saved { get; private set; }

    public AccountDialog() => throw new InvalidOperationException("Use the constructor with a session.");

    public AccountDialog(AppSession session, AccountInfo? editing = null)
    {
        _session = session;
        _editing = editing;
        InitializeComponent();
        TypeBox.ItemsSource = Bookkeeping.AccountTypes;
        if (editing is not null)
        {
            HeadText.Text = "Change account";
            CodeBox.Text = editing.Code; NameBox.Text = editing.Name; TypeBox.SelectedItem = editing.Type; DescriptionBox.Text = editing.Description;
        }
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();

    public async Task SaveAsync()
    {
        ErrorBox.IsVisible = false;
        if (_session.Api is null) { Fail("Accounts need an internet connection."); return; }
        SaveButton.IsEnabled = false;
        var result = await Bookkeeping.SaveAccountAsync(_session.Api, _session.Workspace.OrganizationId, _editing?.Id, CodeBox.Text ?? "", NameBox.Text ?? "", TypeBox.SelectedItem as string ?? "", DescriptionBox.Text);
        SaveButton.IsEnabled = true;
        if (!result.Ok) { Fail(result.Error ?? "Could not save."); return; }
        Saved = true;
        Close();
    }

    private async void OnSave(object? sender, RoutedEventArgs e) => await SaveAsync();
    private void Fail(string text) { ErrorText.Text = text; ErrorBox.IsVisible = true; }
}
