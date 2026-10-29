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

        var catalog = _session.Store.GetCatalog();
        LabGrid.ItemsSource = catalog.Labs;
        CenterGrid.ItemsSource = catalog.Centers;
        Footnote.Text = _tab == "team" ? CanManageTeam ? "New staff can sign in to the app and the website straight away. Roles and permissions are managed on the website." : "Staff accounts and access are managed by your lab's admin." : "Labs and collection centres are set up on the LabShope website.";
    }

    private bool CanManageTeam => _session.Api is not null && _session.Workspace.IsAdmin;

    private async void OnAddStaff(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null) return;
        var dialog = new StaffDialog(_session.Api, _session.Workspace.OrganizationId, _session.Store.GetCatalog().Labs, _session.Workspace.LabId);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved) await LoadTeamAsync();
    }

    private async void OnToggleStaff(object? sender, RoutedEventArgs e)
    {
        if (!CanManageTeam || _session.Api is null || TeamGrid.SelectedItem is not TeamMember person) return;
        var result = await TeamService.SetActiveAsync(_session.Api, _session.Workspace.OrganizationId, person.Id, !person.IsActive);
        if (result.Ok) { await LoadTeamAsync(); return; }
        MessageCard.IsVisible = true;
        MessageText.Text = result.Error;
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
