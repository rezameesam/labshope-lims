using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Roles &amp; permissions (admins). Online only.</summary>
public partial class RolesView : UserControl
{
    private readonly AppSession _session;

    public RolesView() => throw new InvalidOperationException("Use the constructor with a session.");

    public RolesView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        Grid.SelectionChanged += (_, _) => UpdateButtons();
        UpdateButtons();
        Opened();
    }

    private async void Opened() => await RefreshAsync();

    public async Task RefreshAsync()
    {
        if (_session.Api is null) { MessageText.Text = "Roles need an internet connection."; return; }
        MessageText.Text = "";
        var (roles, error) = await RolesAdmin.LoadAsync(_session.Api, _session.Workspace.OrganizationId);
        if (error is not null) { MessageText.Text = error; return; }
        Grid.ItemsSource = roles;
        UpdateButtons();
    }

    private void UpdateButtons()
    {
        var role = Grid.SelectedItem as RoleRow;
        EditButton.IsEnabled = role is not null;
        DeleteButton.IsEnabled = role is { IsSystem: false };
    }

    private async void OnRefresh(object? sender, RoutedEventArgs e) => await RefreshAsync();

    private async void OnAdd(object? sender, RoutedEventArgs e)
    {
        var dialog = new RoleDialog(_session);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved) { await RefreshAsync(); MessageText.Text = "Role created."; }
    }

    private async void OnEdit(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not RoleRow role) return;
        var dialog = new RoleDialog(_session, role);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved) { await RefreshAsync(); MessageText.Text = "Role saved."; }
    }

    public async Task DeleteAsync(RoleRow role)
    {
        if (_session.Api is null) { MessageText.Text = "Roles need an internet connection."; return; }
        var r = await RolesAdmin.DeleteAsync(_session.Api, _session.Workspace.OrganizationId, role);
        if (r.Ok) await RefreshAsync();
        MessageText.Text = r.Ok ? "Role deleted." : r.Error;
    }

    private async void OnDelete(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not RoleRow role) return;
        var detail = role.Users > 0 ? $"{role.Users} staff member(s) have this role and will lose it. This cannot be undone." : "This cannot be undone.";
        if (await ConfirmDialog.AskAsync((Window)TopLevel.GetTopLevel(this)!, $"Delete {role.Name}?", detail, "Delete")) await DeleteAsync(role);
    }
}
