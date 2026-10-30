using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Creates a role or changes one: name, description, active and the permissions it grants.</summary>
public partial class RoleDialog : Window
{
    private readonly AppSession _session;
    private readonly RoleRow? _editing;
    private readonly Dictionary<string, CheckBox> _boxes = [];

    public bool Saved { get; private set; }

    public RoleDialog() => throw new InvalidOperationException("Use the constructor with a session.");

    public RoleDialog(AppSession session, RoleRow? editing = null)
    {
        _session = session;
        _editing = editing;
        InitializeComponent();
        foreach (var (group, permissions) in RolesAdmin.Groups)
        {
            var panel = new StackPanel { Spacing = 2 };
            var all = new CheckBox { Content = group, FontWeight = Avalonia.Media.FontWeight.SemiBold };
            var members = new List<CheckBox>();
            foreach (var p in permissions)
            {
                var box = new CheckBox { Content = RolesAdmin.Label(p), Margin = new Avalonia.Thickness(22, 0, 0, 0) };
                box.IsCheckedChanged += (_, _) => all.IsChecked = members.All(m => m.IsChecked == true) ? true : members.Any(m => m.IsChecked == true) ? null : false;
                _boxes[p] = box; members.Add(box);
            }
            all.IsThreeState = false;
            all.Click += (_, _) => { var on = all.IsChecked == true; foreach (var m in members) m.IsChecked = on; };
            panel.Children.Add(all);
            foreach (var m in members) panel.Children.Add(m);
            PermissionPanel.Children.Add(panel);
        }
        if (editing is not null)
        {
            HeadText.Text = "Change role";
            NameBox.Text = editing.Name; DescriptionBox.Text = editing.Description; ActiveBox.IsChecked = editing.IsActive;
            Opened += async (_, _) => await LoadPermissionsAsync();
        }
    }

    public async Task LoadPermissionsAsync()
    {
        if (_session.Api is null || _editing is null) return;
        var (granted, error) = await RolesAdmin.PermissionsOfAsync(_session.Api, _editing.Id);
        if (error is not null) { Fail(error); SaveButton.IsEnabled = false; return; }
        foreach (var (p, box) in _boxes) box.IsChecked = granted.Contains(p);
    }

    public IReadOnlySet<string> Selected => _boxes.Where(b => b.Value.IsChecked == true).Select(b => b.Key).ToHashSet();

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();

    public async Task SaveAsync()
    {
        ErrorBox.IsVisible = false;
        if (_session.Api is null) { Fail("Roles need an internet connection."); return; }
        SaveButton.IsEnabled = false;
        var result = await RolesAdmin.SaveAsync(_session.Api, _session.Workspace.OrganizationId, _editing?.Id, NameBox.Text ?? "", DescriptionBox.Text, ActiveBox.IsChecked == true, Selected.ToHashSet());
        SaveButton.IsEnabled = true;
        if (!result.Ok) { Fail(result.Error ?? "Could not save."); return; }
        Saved = true;
        Close();
    }

    private async void OnSave(object? sender, RoutedEventArgs e) => await SaveAsync();
    private void Fail(string text) { ErrorText.Text = text; ErrorBox.IsVisible = true; }
}
