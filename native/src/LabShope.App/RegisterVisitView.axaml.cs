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
    private bool _payEdited;
    private bool _existingMode = true;
    private bool _allowDuplicatePhone;

    /// <summary>Asks what to do when the phone number is shared. Tests replace this so no window has to open.</summary>
    public Func<IReadOnlyList<Patient>, string, Task<DuplicateChoice>>? DuplicateChooser { get; set; }
    private Receipt? _lastReceipt;
    private string? _lastVisitId;
    private string? _bookingId;

    /// <summary>Raised after a visit is saved so the window can sync and refresh its lists.</summary>
    public event Action? Registered;

    public RegisterVisitView() => throw new InvalidOperationException("Use the constructor with a session.");

    public RegisterVisitView(AppSession session)
    {
        _session = session;
        _visits = new VisitService(session.Store);
        InitializeComponent();
        NewDob.DisplayDateEnd = DateTime.Today; // nobody is born in the future

        SelectedGrid.ItemsSource = _selected;
        PatientSearch.TextChanged += (_, _) => SearchPatients();
        PatientResults.SelectionChanged += (_, _) => PickPatient();
        TestSearch.TextChanged += (_, _) => SearchTests();
        TestSearch.KeyDown += (_, e) => { if (e.Key == Key.Enter) { AddFirstOrSelectedTest(); e.Handled = true; } };
        TestResults.DoubleTapped += (_, _) => AddFirstOrSelectedTest();
        PackageBox.SelectionChanged += (_, _) => PickPackage();
        PayAmount.TextChanged += (_, _) => { if (PayAmount.IsFocused) _payEdited = true; };
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

    /// <summary>Starts a visit for a booking request: the patient (existing, matched by phone, or new) and the tests it asked for.</summary>
    public void PrefillFromBooking(BookingRequest booking)
    {
        Clear();
        _bookingId = booking.Id;

        var known = (booking.PatientId is not null ? _session.Store.GetPatient(booking.PatientId) : null)
            ?? _session.Store.FindPatientByPhone(PhoneNumbers.LookupVariants(booking.Phone));
        if (known is not null) UsePatient(known);
        else
        {
            _existingMode = false;
            UpdateMode();
            NewName.Text = booking.FullName;
            NewPhone.Text = booking.Phone;
            NoPhoneBox.IsChecked = string.IsNullOrWhiteSpace(booking.Phone);
        }

        // The request's test list is free text ("CBC, Vitamin D"): add whichever names match the catalog exactly.
        var missing = new List<string>();
        foreach (var name in (booking.TestDetails ?? "").Split([',', ';', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var test = _catalog.Tests.FirstOrDefault(t => string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase) || string.Equals(t.TestCode, name, StringComparison.OrdinalIgnoreCase));
            if (test is null) missing.Add(name);
            else if (_selected.All(s => s.Name != test.Name)) _selected.Add(new SelectedTest { Name = test.Name, Price = test.Price });
        }
        UpdateTotal();
        ResultText.Text = $"From the booking by {booking.FullName}." + (missing.Count > 0 ? $" Add by hand: {string.Join(", ", missing)}." : "");
    }

    public void FocusFirstField() => (_existingMode ? PatientSearch : NewName).Focus();

    private void OnNoPhoneChanged(object? sender, RoutedEventArgs e)
    {
        var none = NoPhoneBox.IsChecked == true;
        NewPhone.IsEnabled = !none;
        if (none) NewPhone.Text = "";
    }

    private void OnExistingMode(object? sender, RoutedEventArgs e) { _existingMode = true; UpdateMode(); }
    private void OnNewMode(object? sender, RoutedEventArgs e) { _existingMode = false; UpdateMode(); NewName.Focus(); }

    /// <summary>A barcode scan of a patient card picks that patient.</summary>
    public void UsePatient(Patient patient)
    {
        _existingMode = true;
        UpdateMode();
        _picked = patient;
        PickedPatient.Text = $"{patient.FullName}  ·  {patient.PatientCode}  ·  {patient.Phone}";
        PickedChip.IsVisible = true;
    }

    private void UpdateMode()
    {
        ExistingPanel.IsVisible = _existingMode;
        NewPanel.IsVisible = !_existingMode;
        ExistingButton.Classes.Set("on", _existingMode);
        NewButton.Classes.Set("on", !_existingMode);
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

    private void UpdateTotal()
    {
        var total = VisitService.Total(Tests(), PackageRef());
        TotalText.Text = $"Total {total:0.##}";
        // Most patients pay in full at the counter, so the amount follows the total until the cashier changes it.
        if (!_payEdited) PayAmount.Text = total.ToString("0.##");
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        try
        {
            var existing = _existingMode;
            if (existing && _picked is null) { ResultText.Text = "Pick a patient first (or choose New patient)."; return; }
            if (!existing && string.IsNullOrWhiteSpace(NewName.Text)) { ResultText.Text = "Enter the patient's name."; return; }

            decimal pay = 0;
            if (!string.IsNullOrWhiteSpace(PayAmount.Text) && !decimal.TryParse(PayAmount.Text, out pay)) { ResultText.Text = "Enter the amount being paid as a number (0 if nothing is paid yet)."; return; }
            var total = VisitService.Total(Tests(), PackageRef());
            if (pay > total) { ResultText.Text = $"The amount paid can't be more than the total ({total:0.##})."; return; }

            var doctor = DoctorBox.SelectedItem as Named;
            var center = CenterBox.SelectedItem as Named;
            var input = new RegisterVisitInput(
                _session.Workspace.OrganizationId, _session.Workspace.LabId, DateTime.Now.ToString("yyyy-MM-dd"), Tests(),
                ExistingPatient: existing ? _picked : null,
                NewPatient: existing ? null : new NewPatient(NewName.Text!, NewPhone.Text ?? "", (NewGender.SelectedItem as ComboBoxItem)?.Content?.ToString(),
                    NewDob.SelectedDate?.ToString("yyyy-MM-dd"),
                    NoPhone: NoPhoneBox.IsChecked == true, AllowDuplicatePhone: _allowDuplicatePhone),
                CollectionCenterId: center?.Id,
                Notes: string.IsNullOrWhiteSpace(NotesBox.Text) ? null : NotesBox.Text!.Trim(),
                Package: PackageRef(),
                ReferralDoctorId: doctor?.Id,
                Payment: pay > 0 ? new InitialPayment(pay, (PayMethod.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "cash",
                    string.IsNullOrWhiteSpace(PayRef.Text) ? null : PayRef.Text.Trim()) : null);

            var visit = _visits.Register(input);
            var fromBooking = _bookingId; // Clear() forgets it, so remember which request this visit was for
            Clear();
            _lastReceipt = visit.Receipt;
            _lastVisitId = visit.VisitId;
            LabelButton.IsVisible = true;
            ReceiptButton.IsVisible = visit.Receipt is not null;
            var paid = visit.Receipt is null ? "no payment taken" : $"{visit.Receipt.Amount:0.##} received" + (visit.Receipt.Balance > 0 ? $", {visit.Receipt.Balance:0.##} due" : ", paid in full");
            ResultText.Text = $"Saved: {visit.PatientName}, total {visit.Total:0.##}, {paid}" + (visit.ReusedPatient ? " (existing patient matched by phone)" : "") + $". Bill {visit.InvoiceNumber}. It is sent to the server when online.";
            if (fromBooking is not null)
            {
                new BookingService(_session.Store, _session.Workspace.OrganizationId, _session.Account.SavedUserId).MarkConverted(fromBooking, visit.PatientId);
                ResultText.Text += " The booking is marked converted.";
            }
            Registered?.Invoke();
        }
        catch (DuplicatePhoneException duplicate)
        {
            // The same question the website asks: use that patient, or carry on with a new one.
            var choose = DuplicateChooser ?? ShowDuplicateDialogAsync;
            var choice = await choose(duplicate.Matches, duplicate.Phone);
            if (choice.Kind == DuplicateChoiceKind.UseExisting && choice.Patient is not null) { UsePatient(choice.Patient); OnSave(null, null!); }
            else if (choice.Kind == DuplicateChoiceKind.CreateNew) { _allowDuplicatePhone = true; OnSave(null, null!); }
            else ResultText.Text = "Not saved: that phone number is already registered.";
        }
        catch (ArgumentException ex)
        {
            ResultText.Text = ex.Message.Split('\n')[0].Replace(" (Parameter 'input')", "");
        }
    }

    private async Task<DuplicateChoice> ShowDuplicateDialogAsync(IReadOnlyList<Patient> matches, string phone)
    {
        var dialog = new DuplicatePhoneDialog(matches, phone);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        return dialog.Result;
    }

    private void OnClear(object? sender, RoutedEventArgs e) { Clear(); ResultText.Text = ""; ReceiptButton.IsVisible = false; LabelButton.IsVisible = false; }

    private void OnPrintLabels(object? sender, RoutedEventArgs e)
    {
        if (_lastVisitId is null) return;
        var label = LabelBuilder.ForVisit(_session.Store, _session.Workspace.OrganizationName, _lastVisitId);
        if (label is not null) ReceiptPrinter.OpenHtml($"labels-{label.PatientCode}", LabelHtml.Build(label));
    }

    private void OnPrintReceipt(object? sender, RoutedEventArgs e)
    {
        if (_lastReceipt is not null) ReceiptPrinter.Open(_lastReceipt, _session.Workspace.OrganizationName, _session.Store.GetBranding(_session.Workspace.OrganizationName));
    }

    private void Clear()
    {
        _picked = null; _package = null; _bookingId = null; _allowDuplicatePhone = false;
        NoPhoneBox.IsChecked = false;
        PickedPatient.Text = ""; PickedChip.IsVisible = false; PatientSearch.Text = ""; PatientResults.ItemsSource = null;
        NewName.Text = ""; NewPhone.Text = ""; NewDob.SelectedDate = null; NotesBox.Text = "";
        _selected.Clear();
        _payEdited = false; PayRef.Text = ""; PayMethod.SelectedIndex = 0;
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
