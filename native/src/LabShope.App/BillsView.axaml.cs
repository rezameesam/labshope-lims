using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class BillsView : UserControl
{
    private readonly AppSession _session;

    /// <summary>Raised after a payment is taken so the window can send it.</summary>
    public event Action? PaymentTaken;

    public BillsView() => throw new InvalidOperationException("Use the constructor with a session.");

    public BillsView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        SearchBox.TextChanged += (_, _) => Refresh();
        StatusBox.SelectionChanged += (_, _) => Refresh();
        FromBox.SelectedDateChanged += (_, _) => Refresh();
        ToBox.SelectedDateChanged += (_, _) => Refresh();
        Grid.DoubleTapped += (_, _) => OnDetails(null, null!);
        EditButton.IsVisible = true;
        KeyDown += (_, e) => { if (e.Key == Key.F10) { OnReceive(null, null!); e.Handled = true; } };
        Refresh();
    }

    /// <summary>Shows only this patient's bills (used when the front-desk board sends someone here to take a payment).</summary>
    public void ShowPatient(Patient patient)
    {
        SearchBox.Text = patient.PatientCode;
        Refresh();
    }

    public void Refresh()
    {
        var keep = (Grid.SelectedItem as BillRow)?.Id;
        var status = StatusBox.SelectedIndex switch { 1 => "pending", 2 => "partial", 3 => "paid", _ => null };
        // A day is the local calendar day; bills are stored in UTC, so the window is converted (as text: yyyy-MM-ddTHH:mm:ss).
        static string? Utc(DateTime? day) => day is { } d ? new DateTimeOffset(d.Date, TimeZoneInfo.Local.GetUtcOffset(d.Date)).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss", System.Globalization.CultureInfo.InvariantCulture) : null;
        var rows = _session.Store.SearchBills(SearchBox.Text ?? "", false, 500, status, Utc(FromBox.SelectedDate), Utc(ToBox.SelectedDate?.AddDays(1)));
        SummaryText.Text = $"{rows.Count} bill(s):   collected {rows.Sum(r => r.PaidAmount):0.##}   ·   still to collect {rows.Sum(r => r.Balance):0.##}   ·   billed {rows.Sum(r => r.TotalAmount):0.##}";
        Grid.ItemsSource = rows;
        if (keep is not null) Grid.SelectedItem = rows.FirstOrDefault(r => r.Id == keep);
        CountText.Text = $"{rows.Count} shown of {_session.Store.InvoiceCount()}";
    }

    private async void OnDetails(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not BillRow bill) { MessageText.Text = "Select a bill first."; return; }
        var dialog = new BillDetailsDialog(_session.Api, _session.Workspace.OrganizationId, _session.Store, bill);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
    }

    private async void OnEditBill(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not BillRow bill) { MessageText.Text = "Select a bill first."; return; }
        if (_session.Api is null) { MessageText.Text = "Editing a bill needs an internet connection."; return; }
        if (!_session.Workspace.IsAdmin && bill.PaymentStatus == "paid") { MessageText.Text = "Only administrators can edit a paid bill."; return; }

        var dialog = new BillEditDialog(_session.Api, _session.Workspace.OrganizationId, _session.Account.SavedUserId, _session.Workspace.IsAdmin, bill);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Saved is not { } saved) return;

        _session.Store.UpsertInvoice(saved);
        MessageText.Text = $"Bill {bill.Number} updated: to pay {saved.TotalAmount:0.##}, {saved.PaymentStatus}.";
        Refresh();
    }

    private async void OnReceive(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not BillRow bill) { MessageText.Text = "Select a bill first."; return; }
        if (bill.Balance <= 0) { MessageText.Text = "That bill is already paid in full."; return; }

        var dialog = new PaymentDialog(new PaymentService(_session.Store, _session.Workspace.OrganizationId), bill);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (dialog.Result is null) return;

        MessageText.Text = $"Received {dialog.Result.Amount:0.##} from {bill.PatientName}. Balance {dialog.Result.Balance:0.##}.";
        Refresh();
        ReceiptPrinter.Open(dialog.Result, _session.Workspace.OrganizationName, _session.Store.GetBranding(_session.Workspace.OrganizationName));
        PaymentTaken?.Invoke();
    }

    private void OnPrintLabels(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not BillRow bill) { MessageText.Text = "Select a bill first."; return; }
        var label = LabelBuilder.ForVisit(_session.Store, _session.Workspace.OrganizationName, bill.Id);
        if (label is null) { MessageText.Text = "Can't make a label for that bill."; return; }
        ReceiptPrinter.OpenHtml($"labels-{label.PatientCode}", LabelHtml.Build(label));
    }

    private void OnPrintReceipt(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not BillRow bill) { MessageText.Text = "Select a bill first."; return; }
        var payments = new PaymentService(_session.Store, _session.Workspace.OrganizationId);
        var last = _session.Store.PaymentsFor(bill.Id).LastOrDefault();
        var receipt = last is null ? null : payments.ReceiptFor(last.Id, bill.Id);
        if (receipt is null) { MessageText.Text = "No payment has been received on that bill yet."; return; }
        ReceiptPrinter.Open(receipt, _session.Workspace.OrganizationName, _session.Store.GetBranding(_session.Workspace.OrganizationName));
    }
}
