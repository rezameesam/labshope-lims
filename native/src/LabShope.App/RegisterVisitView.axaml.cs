using System.Collections.ObjectModel;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

public sealed class SelectedTest
{
    public required string Name { get; init; }
    public required decimal Price { get; init; }
    public bool InPackage { get; init; }
    public string PriceText => InPackage ? "in package" : Price.ToString("0.##");
}

public partial class RegisterVisitView : UserControl
{
    private readonly AppSession _session;
    private readonly VisitService _visits;
    private readonly ObservableCollection<SelectedTest> _selected = [];
    private Catalog _catalog = new([], [], [], [], []);
    private Patient? _picked;
    private TestPackage? _package;
    private List<CatalogTest> _matches = [];

    /// <summary>Raised after a visit is saved so the window can sync and refresh its lists.</summary>
    public event Action? Registered;

    public RegisterVisitView() => throw new InvalidOperationException("Use the constructor with a session.");

    public RegisterVisitView(AppSession session)
    {
        _session = session;
        _visits = new VisitService(session.Store);
        InitializeComponent();

        SelectedGrid.ItemsSource = _selected;
        ExistingRadio.IsCheckedChanged += (_, _) => UpdateMode();
        PatientSearch.TextChanged += (_, _) => SearchPatients();
        PatientResults.SelectionChanged += (_, _) => PickPatient();
        TestSearch.TextChanged += (_, _) => SearchTests();
        TestSearch.KeyDown += (_, e) => { if (e.Key == Key.Enter) { AddFirstOrSelectedTest(); e.Handled = true; } };
        TestResults.DoubleTapped += (_, _) => AddFirstOrSelectedTest();
        PackageBox.SelectionChanged += (_, _) => PickPackage();
        SelectedGrid.KeyDown += (_, e) => { if (e.Key == Key.Delete) RemoveSelected(); };
        KeyDown += (_, e) => { if (e.Key == Key.F8) { OnSave(null, null!); e.Handled = true; } };

        ReloadCatalog();
        UpdateMode();
    }

    /// <summary>Re-reads the catalog (after a sync) without losing what the user is typing.</summary>
    public void ReloadCatalog()
    {
        _catalog = _session.Store.GetCatalog();

        var doctors = new List<object> { "(none)" };
        doctors.AddRange(_catalog.Doctors.Select(d => (object)new Named(d.Id, d.Name + (d.Specialization is null ? "" : $" - {d.Specialization}"))));
        DoctorBox.ItemsSource = doctors;
        DoctorBox.SelectedIndex = DoctorBox.SelectedIndex < 0 ? 0 : DoctorBox.SelectedIndex;

        var centers = new List<object> { "(main lab)" };
        centers.AddRange(_catalog.Centers.Where(c => _session.Workspace.LabId is null || c.LabId == _session.Workspace.LabId).Select(c => (object)new Named(c.Id, c.Name)));
        CenterBox.ItemsSource = centers;
        CenterBox.SelectedIndex = CenterBox.SelectedIndex < 0 ? 0 : CenterBox.SelectedIndex;

        var packages = new List<object> { "(no package)" };
        packages.AddRange(_catalog.Packages.Select(p => (object)new Named(p.Id, $"{p.Name} - {p.Price:0.##}")));
        PackageBox.ItemsSource = packages;
        PackageBox.SelectedIndex = PackageBox.SelectedIndex < 0 ? 0 : PackageBox.SelectedIndex;

        SearchTests();
    }

    public void FocusFirstField() => (ExistingRadio.IsChecked == true ? PatientSearch : NewName).Focus();

    /// <summary>A barcode scan of a patient card picks that patient.</summary>
    public void UsePatient(Patient patient)
    {
        ExistingRadio.IsChecked = true;
        _picked = patient;
        PickedPatient.Text = $"Selected: {patient.FullName} ({patient.PatientCode}, {patient.Phone})";
    }

    private void UpdateMode()
    {
        var existing = ExistingRadio.IsChecked == true;
        ExistingPanel.IsVisible = existing;
        NewPanel.IsVisible = !existing;
    }

    private void SearchPatients()
    {
        var text = PatientSearch.Text ?? "";
        PatientResults.ItemsSource = text.Trim().Length < 2 ? null : _session.Store.SearchPatients(text, 8).Select(p => new PatientRow(p)).ToList();
    }

    private void PickPatient()
    {
        if (PatientResults.SelectedItem is PatientRow row) UsePatient(row.Patient);
    }

    private void SearchTests()
    {
        var words = (TestSearch.Text ?? "").Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        _matches = _catalog.Tests
            .Where(t => words.All(w => t.Name.Contains(w, StringComparison.OrdinalIgnoreCase) || (t.TestCode ?? "").Contains(w, StringComparison.OrdinalIgnoreCase)))
            .Take(40).ToList();
        TestResults.ItemsSource = _matches;
        if (_matches.Count > 0 && words.Length > 0) TestResults.SelectedItem = _matches[0];
    }

    private void AddFirstOrSelectedTest()
    {
        // Enter adds the highlighted match, or the first one when nothing is highlighted yet.
        var test = TestResults.SelectedItem as CatalogTest ?? _matches.FirstOrDefault();
        if (test is null) return;
        if (_selected.Any(s => s.Name == test.Name)) { ResultText.Text = $"{test.Name} is already added."; return; }
        _selected.Add(new SelectedTest { Name = test.Name, Price = test.Price });
        TestSearch.Text = "";
        TestSearch.Focus();
        UpdateTotal();
    }

    private void PickPackage()
    {
        // Remove the tests of the previously chosen package, then add the new one's.
        _selected.Where(s => s.InPackage).ToList().ForEach(s => _selected.Remove(s));
        _package = PackageBox.SelectedItem is Named n ? _catalog.Packages.FirstOrDefault(p => p.Id == n.Id) : null;
        if (_package is not null)
        {
            foreach (var id in _package.TestIds)
            {
                var test = _catalog.Tests.FirstOrDefault(t => t.Id == id);
                if (test is not null && _selected.All(s => s.Name != test.Name))
                    _selected.Add(new SelectedTest { Name = test.Name, Price = test.Price, InPackage = true });
            }
        }
        UpdateTotal();
    }

    private void RemoveSelected()
    {
        if (SelectedGrid.SelectedItem is not SelectedTest test) return;
        _selected.Remove(test);
        if (_selected.All(s => !s.InPackage)) _package = null;
        UpdateTotal();
    }

    private IReadOnlyList<VisitTest> Tests() => _selected.Select(s => new VisitTest(s.Name, s.Price, s.InPackage)).ToList();
    private PackageRef? PackageRef() => _package is not null && _selected.Any(s => s.InPackage) ? new PackageRef(_package.Id, _package.Name, _package.Price) : null;

    private void UpdateTotal() => TotalText.Text = $"Total {VisitService.Total(Tests(), PackageRef()):0.##}";

    private void OnSave(object? sender, RoutedEventArgs e)
    {
        try
        {
            var existing = ExistingRadio.IsChecked == true;
            if (existing && _picked is null) { ResultText.Text = "Pick a patient first (or choose New patient)."; return; }
            if (!existing && string.IsNullOrWhiteSpace(NewName.Text)) { ResultText.Text = "Enter the patient's name."; return; }

            var doctor = DoctorBox.SelectedItem as Named;
            var center = CenterBox.SelectedItem as Named;
            var input = new RegisterVisitInput(
                _session.Workspace.OrganizationId, _session.Workspace.LabId, DateTime.Now.ToString("yyyy-MM-dd"), Tests(),
                ExistingPatient: existing ? _picked : null,
                NewPatient: existing ? null : new NewPatient(NewName.Text!, NewPhone.Text ?? "", (NewGender.SelectedItem as ComboBoxItem)?.Content?.ToString(),
                    string.IsNullOrWhiteSpace(NewDob.Text) ? null : NewDob.Text!.Trim()),
                CollectionCenterId: center?.Id,
                Notes: string.IsNullOrWhiteSpace(NotesBox.Text) ? null : NotesBox.Text!.Trim(),
                Package: PackageRef(),
                ReferralDoctorId: doctor?.Id);

            var visit = _visits.Register(input);
            Clear();
            ResultText.Text = $"Saved: {visit.PatientName}, total {visit.Total:0.##}" + (visit.ReusedPatient ? " (existing patient matched by phone)" : "") + ". It will be sent to the server when online.";
            Registered?.Invoke();
        }
        catch (ArgumentException ex)
        {
            ResultText.Text = ex.Message.Split('\n')[0].Replace(" (Parameter 'input')", "");
        }
    }

    private void OnClear(object? sender, RoutedEventArgs e) { Clear(); ResultText.Text = ""; }

    private void Clear()
    {
        _picked = null; _package = null;
        PickedPatient.Text = ""; PatientSearch.Text = ""; PatientResults.ItemsSource = null;
        NewName.Text = ""; NewPhone.Text = ""; NewDob.Text = ""; NotesBox.Text = "";
        _selected.Clear();
        DoctorBox.SelectedIndex = 0; CenterBox.SelectedIndex = 0; PackageBox.SelectedIndex = 0;
        UpdateTotal();
        FocusFirstField();
    }

    private sealed record Named(string Id, string Name) { public override string ToString() => Name; }

    /// <summary>Wraps a patient so the list shows one readable line.</summary>
    private sealed record PatientRow(Patient Patient)
    {
        public override string ToString() => $"{Patient.FullName}   {Patient.Phone}   {Patient.PatientCode}";
    }
}
