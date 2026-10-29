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
        UnpaidOnly.IsCheckedChanged += (_, _) => Refresh();
        Grid.DoubleTapped += (_, _) => OnReceive(null, null!);
        KeyDown += (_, e) => { if (e.Key == Key.F6) { OnReceive(null, null!); e.Handled = true; } };
        Refresh();
    }

    public void Refresh()
    {
        var keep = (Grid.SelectedItem as BillRow)?.Id;
        var rows = _session.Store.SearchBills(SearchBox.Text ?? "", UnpaidOnly.IsChecked == true);
        Grid.ItemsSource = rows;
        if (keep is not null) Grid.SelectedItem = rows.FirstOrDefault(r => r.Id == keep);
        CountText.Text = $"{rows.Count} shown of {_session.Store.InvoiceCount()}";
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
        ReceiptPrinter.Open(dialog.Result, _session.Workspace.OrganizationName);
        PaymentTaken?.Invoke();
    }

    private void OnPrintReceipt(object? sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is not BillRow bill) { MessageText.Text = "Select a bill first."; return; }
        var payments = new PaymentService(_session.Store, _session.Workspace.OrganizationId);
        var last = _session.Store.PaymentsFor(bill.Id).LastOrDefault();
        var receipt = last is null ? null : payments.ReceiptFor(last.Id, bill.Id);
        if (receipt is null) { MessageText.Text = "No payment has been received on that bill yet."; return; }
        ReceiptPrinter.Open(receipt, _session.Workspace.OrganizationName);
    }
}
