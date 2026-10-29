using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;

namespace LabShope.App;

/// <summary>The lab's tests, packages and doctors (kept on this PC, so they browse instantly offline). Managers can edit a test's price and range.</summary>
public partial class CatalogView : UserControl
{
    private readonly AppSession _session;
    private string _tab = "tests";

    /// <summary>Raised after a test was changed on the server so the window can refresh the catalog.</summary>
    public event Action? CatalogChanged;

    public CatalogView() => throw new InvalidOperationException("Use the constructor with a session.");

    public CatalogView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        SearchBox.TextChanged += (_, _) => Refresh();
        TestGrid.DoubleTapped += (_, _) => OnEdit(null, null!);
        Refresh();
    }

    private void OnTab(object? sender, RoutedEventArgs e)
    {
        _tab = (string)((Button)sender!).Tag!;
        Refresh();
    }

    public void Refresh()
    {
        foreach (var (b, key) in new[] { (TestsButton, "tests"), (PackagesButton, "packages"), (DoctorsButton, "doctors") }) b.Classes.Set("on", key == _tab);
        TestGrid.IsVisible = _tab == "tests"; PackageGrid.IsVisible = _tab == "packages"; DoctorGrid.IsVisible = _tab == "doctors";
        EditButton.IsVisible = NewButton.IsVisible = _tab == "tests" && CanEdit;

        var words = (SearchBox.Text ?? "").Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        bool Match(params string?[] fields) => words.All(w => fields.Any(f => f?.Contains(w, StringComparison.OrdinalIgnoreCase) == true));

        var catalog = _session.Store.GetCatalog();
        switch (_tab)
        {
            case "packages":
                var packages = catalog.Packages.Where(p => Match(p.Name)).ToList();
                PackageGrid.ItemsSource = packages; CountText.Text = $"{packages.Count} package(s)"; break;
            case "doctors":
                var doctors = catalog.Doctors.Where(d => Match(d.Name, d.Specialization)).ToList();
                DoctorGrid.ItemsSource = doctors; CountText.Text = $"{doctors.Count} doctor(s)"; break;
            default:
                var tests = catalog.Tests.Where(t => Match(t.Name, t.TestCode)).ToList();
                TestGrid.ItemsSource = tests; CountText.Text = $"{tests.Count} test(s)"; break;
        }
    }

    private bool CanEdit => _session.Api is not null && (_session.Workspace.Roles is null || _session.Workspace.IsAdmin);

    private async void OnNew(object? sender, RoutedEventArgs e)
    {
        if (_tab != "tests" || !CanEdit || _session.Api is null) return;

        var dialog = new NewTestDialog(_session.Api, _session.Workspace.OrganizationId, _session.Store.GetCatalog());
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (!dialog.Saved) return;

        MessageText.Text = "Test added. It appears here and on other computers at the next sync (press F9).";
        MessageText.Foreground = (Avalonia.Media.IBrush)Avalonia.Application.Current!.FindResource("SuccessBrush")!;
        CatalogChanged?.Invoke();
    }

    private async void OnEdit(object? sender, RoutedEventArgs e)
    {
        if (_tab != "tests" || !CanEdit || TestGrid.SelectedItem is not CatalogTest test || _session.Api is null) return;

        var dialog = new TestEditDialog(_session.Api, _session.Workspace.OrganizationId, test);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (!dialog.Saved) return;

        MessageText.Text = $"{test.Name} updated. The new values reach other computers at their next sync.";
        MessageText.Foreground = (Avalonia.Media.IBrush)Avalonia.Application.Current!.FindResource("SuccessBrush")!;
        CatalogChanged?.Invoke();
    }
}
