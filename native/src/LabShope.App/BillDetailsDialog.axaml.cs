using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>One bill in full: items, payments (with who took them) and the history of changes. The payments on this PC show even offline.</summary>
public partial class BillDetailsDialog : Window
{
    public BillDetailsDialog() => throw new InvalidOperationException("Use the constructor with a bill.");

    public BillDetailsDialog(SupabaseApi? api, string organizationId, LocalStore store, BillRow bill)
    {
        InitializeComponent();
        Heading.Text = $"{bill.Number}  ·  {bill.PatientName}";
        SubHeading.Text = $"{bill.PatientCode}  ·  {bill.Date}  ·  {bill.PaymentStatus}";
        var price = bill.TotalAmount + bill.Discount;
        Amounts.Text = (bill.Discount > 0 ? $"Price {price:0.##}   ·   Discount {bill.Discount:0.##}   ·   " : "") +
                       $"To pay {bill.TotalAmount:0.##}   ·   Paid {bill.PaidAmount:0.##}   ·   Balance {bill.Balance:0.##}";

        // Until the server answers (or when offline) show the payments recorded on this PC.
        PaymentGrid.ItemsSource = store.PaymentsFor(bill.Id).Select(p => new BillPayment(p.Id, p.Amount, p.Method, p.PaidAt, p.TransactionId, p.Notes, null)).ToList();
        Opened += async (_, _) =>
        {
            if (api is null) { ShowNotice("Items and history need an internet connection."); return; }
            var details = await BillingAdmin.LoadAsync(api, organizationId, bill.Id);
            if (details.Error is not null) { ShowNotice(details.Error); return; }
            ItemGrid.ItemsSource = details.Items;
            PaymentGrid.ItemsSource = details.Payments;
            HistoryGrid.ItemsSource = details.History;
        };
    }

    private void ShowNotice(string text) { NoticeText.Text = text; NoticeBox.IsVisible = true; }

    private void OnClose(object? sender, RoutedEventArgs e) => Close();
}
