using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Labs and collection centres (kept on this PC) and the team (read from the server). Accounts and access are managed on the website.</summary>
public partial class OrganizationView : UserControl
{
    private readonly AppSession _session;
    private string _tab = "labs";
    private bool _teamLoaded;

    /// <summary>Raised after a lab or centre changed on the server so the window can refresh the catalog.</summary>
    public event Action? CatalogChanged;

    public OrganizationView() => throw new InvalidOperationException("Use the constructor with a session.");

    public OrganizationView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        Refresh();
    }

    private async void OnTab(object? sender, RoutedEventArgs e)
    {
        _tab = (string)((Button)sender!).Tag!;
        Refresh();
        if (_tab == "team" && !_teamLoaded) await LoadTeamAsync();
    }

    public void Refresh()
    {
        foreach (var (b, key) in new[] { (LabsButton, "labs"), (CentersButton, "centers"), (TeamButton, "team") }) b.Classes.Set("on", key == _tab);
        LabGrid.IsVisible = _tab == "labs"; CenterGrid.IsVisible = _tab == "centers"; TeamGrid.IsVisible = _tab == "team";
        MessageCard.IsVisible = MessageCard.IsVisible && _tab == "team";
        TeamActions.IsVisible = _tab == "team" && CanManageTeam;
        OrgActions.IsVisible = _tab != "team" && CanManageTeam;
        NewOrgText.Text = _tab == "labs" ? "New lab" : "New collection centre";

        var catalog = _session.Store.GetCatalog();
        LabGrid.ItemsSource = catalog.Labs;
        CenterGrid.ItemsSource = catalog.Centers;
        Footnote.Text = _tab == "team" ? CanManageTeam ? "New staff can sign in to the app and the website straight away. Roles and permissions are managed on the website." : "Staff accounts and access are managed by your lab's admin." : "Changes to labs and centres reach other computers at their next sync (press F9).";
    }

    private bool CanManageTeam => _session.Api is not null && _session.Workspace.IsAdmin;

    private async void OnAddStaff(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null) return;
        var dialog = new StaffDialog(_session.Api, _session.Workspace.OrganizationId, _session.Store.GetCatalog().Labs, _session.Workspace.LabId);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved) await LoadTeamAsync();
    }

    private async void OnEditStaff(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null || TeamGrid.SelectedItem is not TeamMember person) return;
        var dialog = new StaffEditDialog(_session.Api, _session.Workspace.OrganizationId, person);
        await dialog.ShowDialog(Owner);
        if (dialog.Saved) await LoadTeamAsync();
    }

    private async void OnResetStaff(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null || TeamGrid.SelectedItem is not TeamMember person) return;
        if (!person.IsActive) { Say("Switch the person on before resetting their password."); return; }
        var dialog = new ResetPasswordDialog(_session.Api, person, $"https://{_session.Workspace.Slug}.labshope.com/staff/reset-password");
        await dialog.ShowDialog(Owner);
    }

    private async void OnToggleStaff(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null || TeamGrid.SelectedItem is not TeamMember person) return;
        if (person.IsActive && string.Equals(person.Email, _session.Api.Session?.Email, StringComparison.OrdinalIgnoreCase))
        {
            MessageCard.IsVisible = true;
            MessageText.Text = "You can't switch yourself off. Ask another admin to do it.";
            return;
        }
        var result = await TeamService.SetActiveAsync(_session.Api, _session.Workspace.OrganizationId, person.Id, !person.IsActive);
        if (result.Ok) { await LoadTeamAsync(); return; }
        MessageCard.IsVisible = true;
        MessageText.Text = result.Error;
    }

    private Window Owner => (Window)TopLevel.GetTopLevel(this)!;

    private void Say(string text)
    {
        MessageCard.IsVisible = true;
        MessageText.Text = text;
    }

    private void Done(string text)
    {
        MessageCard.IsVisible = false;
        Footnote.Text = text;
        CatalogChanged?.Invoke();
    }

    private async void OnNewOrg(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null) return;
        var org = _session.Workspace.OrganizationId;
        var labs = _session.Store.GetCatalog().Labs;
        if (_tab == "labs")
        {
            var dialog = new LabDialog(_session.Api, org, labs, null);
            await dialog.ShowDialog(Owner);
            if (dialog.Saved) Done("Lab added.");
        }
        else
        {
            var dialog = new CenterDialog(_session.Api, org, labs, _session.Workspace.LabId, null, null);
            await dialog.ShowDialog(Owner);
            if (dialog.Saved) Done("Collection centre added.");
        }
    }

    private async void OnEditOrg(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null) return;
        var org = _session.Workspace.OrganizationId;
        var labs = _session.Store.GetCatalog().Labs;
        if (_tab == "labs" && LabGrid.SelectedItem is LabRef lab)
        {
            var (full, error) = await OrgAdmin.LoadLabAsync(_session.Api, org, lab.Id);
            if (full is null) { Say(error ?? "Could not open the lab."); return; }
            var dialog = new LabDialog(_session.Api, org, labs, full);
            await dialog.ShowDialog(Owner);
            if (dialog.Saved) Done($"{lab.Name} updated.");
        }
        else if (_tab == "centers" && CenterGrid.SelectedItem is CenterRef center)
        {
            var (input, error) = await OrgAdmin.LoadCenterAsync(_session.Api, org, center.Id);
            if (input is null) { Say(error ?? "Could not open the centre."); return; }
            var dialog = new CenterDialog(_session.Api, org, labs, null, center.Id, input);
            await dialog.ShowDialog(Owner);
            if (dialog.Saved) Done($"{center.Name} updated.");
        }
    }

    private async void OnDeleteOrg(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null) return;
        var org = _session.Workspace.OrganizationId;
        string? id = null, name = null;
        if (_tab == "labs" && LabGrid.SelectedItem is LabRef lab) (id, name) = (lab.Id, lab.Name);
        else if (_tab == "centers" && CenterGrid.SelectedItem is CenterRef center) (id, name) = (center.Id, center.Name);
        if (id is null) return;

        var confirm = new ConfirmDialog($"Delete {name}?", "It is removed for every computer in the lab. If it already has patients or bills it can't be deleted; untick Active when editing instead.", "Delete");
        await confirm.ShowDialog(Owner);
        if (!confirm.Confirmed) return;
        var result = _tab == "labs" ? await OrgAdmin.DeleteLabAsync(_session.Api, org, id) : await OrgAdmin.DeleteCenterAsync(_session.Api, org, id);
        if (result.Ok) Done($"{name} deleted.");
        else Say(result.Error ?? "Not deleted.");
    }

    private async Task LoadTeamAsync()
    {
        if (_session.Api is null) return;
        var result = await TeamService.LoadAsync(_session.Api, _session.Workspace.OrganizationId);
        _teamLoaded = result.Error is null;
        TeamGrid.ItemsSource = result.Members;
        MessageCard.IsVisible = result.Error is not null;
        MessageText.Text = result.Error;
    }

    public Task LoadTeamForTestAsync() => LoadTeamAsync();
}
