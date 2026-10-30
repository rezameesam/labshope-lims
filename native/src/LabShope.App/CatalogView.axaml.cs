using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

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
        foreach (var (b, key) in new[] { (TestsButton, "tests"), (PackagesButton, "packages"), (DoctorsButton, "doctors"), (LabsButton, "labs"), (CategoriesButton, "categories") }) b.Classes.Set("on", key == _tab);
        TestGrid.IsVisible = _tab == "tests"; PackageGrid.IsVisible = _tab == "packages"; DoctorGrid.IsVisible = _tab == "doctors";
        LabGrid.IsVisible = _tab == "labs"; CategoryGrid.IsVisible = _tab == "categories";
        NewButton.IsVisible = CanEdit;
        EditButton.IsVisible = CanEdit && _tab != "categories";
        DeleteButton.IsVisible = CanEdit && _tab is "packages" or "doctors" or "labs";
        NewText.Text = _tab switch { "packages" => "New package", "doctors" => "New doctor", "labs" => "New external lab", "categories" => "New category", _ => "New test" };
        EditText.Text = _tab switch { "tests" => "Edit price and range", "packages" => "Edit package", "doctors" => "Edit doctor", _ => "Edit external lab" };
        DeleteText.Text = _tab == "labs" ? "Switch off" : "Delete";

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
            case "labs":
                var labs = catalog.ExternalLabList.Where(l => Match(l.Name, l.Code)).ToList();
                LabGrid.ItemsSource = labs; CountText.Text = $"{labs.Count} external lab(s)"; break;
            case "categories":
                var categories = catalog.CategoryList.Where(c => Match(c.Name)).ToList();
                CategoryGrid.ItemsSource = categories; CountText.Text = $"{categories.Count} categor(ies)"; break;
            default:
                var tests = catalog.Tests.Where(t => Match(t.Name, t.TestCode)).ToList();
                TestGrid.ItemsSource = tests; CountText.Text = $"{tests.Count} test(s)"; break;
        }
    }

    private bool CanEdit => _session.Api is not null && _session.Workspace.IsAdmin;

    private Window Owner => (Window)TopLevel.GetTopLevel(this)!;

    private void Done(string message)
    {
        MessageText.Text = message;
        MessageText.Foreground = (Avalonia.Media.IBrush)Avalonia.Application.Current!.FindResource("SuccessBrush")!;
        CatalogChanged?.Invoke();
    }

    private void Problem(string message)
    {
        MessageText.Text = message;
        MessageText.Foreground = (Avalonia.Media.IBrush)Avalonia.Application.Current!.FindResource("DangerBrush")!;
    }

    private async void OnNew(object? sender, RoutedEventArgs e)
    {
        if (!CanEdit || _session.Api is null) return;
        var org = _session.Workspace.OrganizationId;
        switch (_tab)
        {
            case "packages":
                var package = new PackageDialog(_session.Api, org, _session.Store.GetCatalog(), null, null);
                await package.ShowDialog(Owner);
                if (package.Saved) Done("Package added. It appears on other computers at the next sync (press F9).");
                break;
            case "labs":
                var lab = new ExternalLabDialog(_session.Api, org, null, null);
                await lab.ShowDialog(Owner);
                if (lab.Saved) Done("External lab added. It appears on other computers at the next sync (press F9).");
                break;
            case "categories":
                var category = new CategoryDialog(_session.Api, org, _session.Store.GetCatalog().CategoryList.Select(c => c.Name).ToList());
                await category.ShowDialog(Owner);
                if (category.Saved) Done("Category added. It appears on other computers at the next sync (press F9).");
                break;
            case "doctors":
                var doctor = new DoctorDialog(_session.Api, org, null);
                await doctor.ShowDialog(Owner);
                if (doctor.Saved) Done("Doctor added. They appear on other computers at the next sync (press F9).");
                break;
            default:
                var dialog = new NewTestDialog(_session.Api, org, _session.Store.GetCatalog());
                await dialog.ShowDialog(Owner);
                if (dialog.Saved) Done("Test added. It appears here and on other computers at the next sync (press F9).");
                break;
        }
    }

    private async void OnEdit(object? sender, RoutedEventArgs e)
    {
        if (!CanEdit || _session.Api is null) return;
        var org = _session.Workspace.OrganizationId;
        switch (_tab)
        {
            case "packages" when PackageGrid.SelectedItem is TestPackage selected:
                var (details, packageError) = await CatalogManage.LoadPackageAsync(_session.Api, org, selected);
                if (details is null) { Problem(packageError ?? "Could not open the package."); return; }
                var package = new PackageDialog(_session.Api, org, _session.Store.GetCatalog(), selected, details);
                await package.ShowDialog(Owner);
                if (package.Saved) Done($"{selected.Name} updated. The change reaches other computers at their next sync.");
                break;
            case "doctors" when DoctorGrid.SelectedItem is Doctor picked:
                var (full, doctorError) = await CatalogManage.LoadDoctorAsync(_session.Api, org, picked.Id);
                if (full is null) { Problem(doctorError ?? "Could not open the doctor."); return; }
                var doctor = new DoctorDialog(_session.Api, org, full);
                await doctor.ShowDialog(Owner);
                if (doctor.Saved) Done($"{picked.Name} updated. The change reaches other computers at their next sync.");
                break;
            case "labs" when LabGrid.SelectedItem is ExternalLab chosen:
                var (labInput, labError) = await CatalogManage.LoadExternalLabAsync(_session.Api, org, chosen.Id);
                if (labInput is null) { Problem(labError ?? "Could not open the lab."); return; }
                var labDialog = new ExternalLabDialog(_session.Api, org, chosen.Id, labInput);
                await labDialog.ShowDialog(Owner);
                if (labDialog.Saved) Done($"{chosen.Name} updated. The change reaches other computers at their next sync.");
                break;
            case "tests" when TestGrid.SelectedItem is CatalogTest test:
                var dialog = new TestEditDialog(_session.Api, org, test);
                await dialog.ShowDialog(Owner);
                if (dialog.Saved) Done($"{test.Name} updated. The new values reach other computers at their next sync.");
                break;
        }
    }

    private async void OnDelete(object? sender, RoutedEventArgs e)
    {
        if (!CanEdit || _session.Api is null) return;
        var org = _session.Workspace.OrganizationId;
        string? id = null, name = null;
        if (_tab == "packages" && PackageGrid.SelectedItem is TestPackage p) (id, name) = (p.Id, p.Name);
        else if (_tab == "doctors" && DoctorGrid.SelectedItem is Doctor d) (id, name) = (d.Id, d.Name);
        else if (_tab == "labs" && LabGrid.SelectedItem is ExternalLab x) (id, name) = (x.Id, x.Name);
        if (id is null) return;

        if (_tab == "labs")
        {
            var off = new ConfirmDialog($"Switch off {name}?", "It is no longer offered when sending a test out. Tests already sent keep their lab. To switch it on again, use the website's External Labs page.", "Switch off");
            await off.ShowDialog(Owner);
            if (!off.Confirmed) return;
            var switched = await CatalogManage.SetExternalLabActiveAsync(_session.Api, org, id, false);
            if (switched.Ok) Done($"{name} switched off. It disappears from other computers at their next sync.");
            else Problem(switched.Error ?? "Not changed.");
            return;
        }

        var confirm = new ConfirmDialog($"Delete {name}?", _tab == "packages" ? "The package is removed for every computer in the lab. Bills already made keep their tests." : "The doctor is removed for every computer in the lab.", "Delete");
        await confirm.ShowDialog(Owner);
        if (!confirm.Confirmed) return;

        var result = _tab == "packages" ? await CatalogManage.DeletePackageAsync(_session.Api, org, id) : await CatalogManage.DeleteDoctorAsync(_session.Api, org, id);
        if (result.Ok) Done($"{name} deleted. It disappears from other computers at their next sync.");
        else Problem(result.Error ?? "Not deleted.");
    }
}
