using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class PaymentDialog : Window
{
    private readonly PaymentService _payments;
    private readonly BillRow _bill;

    /// <summary>The receipt, when a payment was taken.</summary>
    public Receipt? Result { get; private set; }

    public PaymentDialog() => throw new InvalidOperationException("Use the constructor with a bill.");

    public PaymentDialog(PaymentService payments, BillRow bill)
    {
        _payments = payments;
        _bill = bill;
        InitializeComponent();
        Heading.Text = $"{bill.PatientName}  -  {bill.Number}";
        Summary.Text = $"Total {bill.TotalAmount:0.##}   Paid {bill.PaidAmount:0.##}   Balance {bill.Balance:0.##}";
        AmountBox.Text = bill.Balance.ToString("0.##");
        Opened += (_, _) => { AmountBox.Focus(); AmountBox.SelectAll(); };
    }

    private void OnSave(object? sender, RoutedEventArgs e)
    {
        if (!decimal.TryParse(AmountBox.Text, out var amount)) { Fail("Enter the amount as a number."); return; }
        try
        {
            Result = _payments.Record(new PaymentInput(_bill.Id, amount, (MethodBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "cash",
                string.IsNullOrWhiteSpace(RefBox.Text) ? null : RefBox.Text.Trim(), NotifyPatient: true));
            Close();
        }
        catch (ArgumentException ex) { Fail(ex.Message); }
    }

    private void Fail(string message) { ErrorText.Text = message; ErrorText.IsVisible = true; }
    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
