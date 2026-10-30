using System.Globalization;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>One test of the patient that could go on the bill, with the price as typed.</summary>
public sealed class BillTestRow(PatientTest test, decimal price, AlreadyBilled? billed)
{
    public string TestId => test.Id;
    public string TestName => test.TestName;
    public string Label => $"{test.TestName}   ·   {Dates.FromIso(test.TestDate)}";
    public bool IsSelected { get; set; }
    public string PriceText { get; set; } = price.ToString("0.##", CultureInfo.CurrentCulture);
    public decimal? Price => decimal.TryParse(PriceText, NumberStyles.Number, CultureInfo.CurrentCulture, out var p) && p >= 0 ? p : null;
    public bool CanSelect => billed is null || !billed.Paid;
    public string Note { get; } = billed is null ? "" : billed.Paid ? $"Already on paid bill {billed.InvoiceNumber}" : $"Already on unpaid bill {billed.InvoiceNumber}";
    public PatientTest Test => test;
}

public partial class NewBillDialog : Window
{
    private readonly AppSession _session;
    private Patient? _patient;
    private List<BillTestRow> _rows = [];
    private bool _confirmed;

    /// <summary>The bill that was created, or null.</summary>
    public Invoice? Created { get; private set; }

    public NewBillDialog() => throw new InvalidOperationException("Use the constructor with a session.");

    public NewBillDialog(AppSession session, Patient? patient = null)
    {
        _session = session;
        InitializeComponent();
        PatientSearch.TextChanged += (_, _) => SearchPatients();
        PatientResults.SelectionChanged += async (_, _) => { if (PatientResults.SelectedItem is Patient p) await PickAsync(p); };
        PatientResults.ItemTemplate = new Avalonia.Controls.Templates.FuncDataTemplate<Patient>((p, _) => new TextBlock { Text = $"{p.FullName}  ·  {p.PatientCode}  ·  {p.Phone}" });
        if (patient is not null) Opened += async (_, _) => await PickAsync(patient);
    }

    private void SearchPatients()
    {
        var text = PatientSearch.Text ?? "";
        PatientResults.ItemsSource = text.Trim().Length < 2 ? null : _session.Store.SearchPatients(text, 8).ToList();
    }

    /// <summary>Chooses the patient and lists their tests, marking any already on a bill.</summary>
    public async Task PickAsync(Patient patient)
    {
        _patient = patient;
        _confirmed = false;
        PickedText.Text = $"{patient.FullName}  ·  {patient.PatientCode}";
        PickedText.IsVisible = true;
        PatientResults.ItemsSource = null;
        ErrorBox.IsVisible = false;
        AnywayButton.IsVisible = false;
        SaveButton.IsEnabled = false;

        var tests = _session.Store.TestsOfPatient(patient.Id);
        if (tests.Count == 0) { TestList.ItemsSource = null; LoadText.Text = "This patient has no tests on this computer yet."; LoadText.IsVisible = true; return; }
        if (_session.Api is null) { LoadText.Text = "Billing needs an internet connection."; LoadText.IsVisible = true; return; }

        LoadText.Text = "Checking which tests are already billed…";
        LoadText.IsVisible = true;
        var (billed, error) = await BillCreator.BilledTestsAsync(_session.Api, _session.Workspace.OrganizationId, tests);
        if (error is not null) { LoadText.Text = error; return; }

        _rows = tests.Select(t => new BillTestRow(t, _session.Store.FindCatalogTest(t.TestName)?.Price ?? 0m, billed.GetValueOrDefault(t.Id))).ToList();
        TestList.ItemsSource = _rows;
        LoadText.IsVisible = false;
        SaveButton.IsEnabled = true;
        Recalculate();
    }

    private (decimal Subtotal, decimal Discount, decimal Final) Totals()
    {
        var subtotal = _rows.Where(r => r.IsSelected).Sum(r => r.Price ?? 0m);
        var typed = decimal.TryParse(DiscountBox.Text, NumberStyles.Number, CultureInfo.CurrentCulture, out var d) ? d : 0m;
        var discount = Math.Min(Math.Max(PatientRules.Paise(typed), 0m), subtotal);
        return (subtotal, discount, subtotal - discount);
    }

    private void Recalculate()
    {
        var (subtotal, _, final) = Totals();
        SubtotalText.Text = subtotal.ToString("0.##");
        FinalText.Text = final.ToString("0.##");
    }

    private void OnRowChanged(object? sender, RoutedEventArgs e)
    {
        if (sender is CheckBox { DataContext: BillTestRow row } box) row.IsSelected = box.IsChecked == true;
        Recalculate();
    }

    private void OnPriceChanged(object? sender, TextChangedEventArgs e)
    {
        if (sender is TextBox { DataContext: BillTestRow row } box) row.PriceText = box.Text ?? "";
        Recalculate();
    }

    private void OnBillAgain(object? sender, RoutedEventArgs e) { _confirmed = true; OnSave(null, null!); }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        if (_patient is null || _session.Api is null) return;
        ErrorBox.IsVisible = false;
        var picked = _rows.Where(r => r.IsSelected).ToList();
        if (picked.Any(r => r.Price is null)) { Fail("Enter every price as a number (0 or more)."); return; }

        SaveButton.IsEnabled = false;
        var result = await BillCreator.CreateAsync(_session.Api, _session.Workspace.OrganizationId, _session.Account.SavedUserId, _session.Workspace.LabId, _patient.Id,
            picked.Select(r => new BillTestLine(r.TestId, r.TestName, r.Price!.Value)).ToList(), DiscountBox.Text ?? "", NotesBox.Text, picked.Select(r => r.Test).ToList(), _confirmed);
        if (result.Ok) { Created = result.Invoice; Close(); return; }

        Fail(result.Error ?? "The bill was not created.");
        AnywayButton.IsVisible = result.NeedsConfirmation is { Count: > 0 };
        SaveButton.IsEnabled = true;
    }

    private void Fail(string text) { ErrorText.Text = text; ErrorBox.IsVisible = true; }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
