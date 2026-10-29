using Avalonia.Controls;
using Avalonia.Interactivity;
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

        var catalog = _session.Store.GetCatalog();
        LabGrid.ItemsSource = catalog.Labs;
        CenterGrid.ItemsSource = catalog.Centers;
        Footnote.Text = _tab == "team" ? "Staff accounts and access are managed on the LabShope website." : "Labs and collection centres are set up on the LabShope website.";
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
