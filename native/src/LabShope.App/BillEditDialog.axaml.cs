using System.Globalization;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>One line of the bill being edited: its price as typed, and the amount that gives.</summary>
public sealed class EditableBillItem(BillItem item)
{
    public string Id { get; } = item.Id;
    public string TestName { get; } = item.TestName;
    public decimal Quantity { get; } = item.Quantity;
    public string PriceText { get; set; } = item.UnitPrice.ToString("0.##", CultureInfo.CurrentCulture);
    public decimal? Price => decimal.TryParse(PriceText, out var p) && p >= 0 ? p : null;
    public string AmountText => Price is { } p ? (p * Quantity).ToString("0.##") : "?";
}

public partial class BillEditDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId, _userId;
    private readonly bool _isAdmin;
    private readonly BillRow _bill;
    private List<EditableBillItem> _items = [];

    /// <summary>The bill as the server now has it, when the change was saved.</summary>
    public Invoice? Saved { get; private set; }

    public BillEditDialog() => throw new InvalidOperationException("Use the constructor with a bill.");

    public BillEditDialog(SupabaseApi api, string organizationId, string? userId, bool isAdmin, BillRow bill)
    {
        _api = api; _organizationId = organizationId; _userId = userId ?? ""; _isAdmin = isAdmin; _bill = bill;
        InitializeComponent();
        Heading.Text = $"{bill.Number}  ·  {bill.PatientName}";
        DiscountBox.Text = bill.Discount.ToString("0.##", CultureInfo.CurrentCulture);
        PaidText.Text = $"Already paid: {bill.PaidAmount:0.##}. The status (pending, partial or paid) follows from this.";
        Opened += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        var details = await BillingAdmin.LoadAsync(_api, _organizationId, _bill.Id);
        if (details.Error is not null) { LoadText.Text = details.Error; return; }
        if (details.Items.Count == 0) { LoadText.Text = "This bill has no items to edit."; return; }
        _items = details.Items.Select(i => new EditableBillItem(i)).ToList();
        ItemList.ItemsSource = _items;
        LoadText.IsVisible = false;
        SaveButton.IsEnabled = true;
        Recalculate();
    }

    private (decimal Subtotal, decimal Discount, decimal Final, bool Valid) Totals()
    {
        var valid = _items.All(i => i.Price is not null);
        var subtotal = _items.Sum(i => (i.Price ?? 0m) * i.Quantity);
        var typed = decimal.TryParse(DiscountBox.Text, out var d) ? d : 0m;
        var discount = Math.Min(Math.Max(PatientRules.Paise(typed), 0m), subtotal);
        return (subtotal, discount, subtotal - discount, valid);
    }

    private void Recalculate()
    {
        var (subtotal, discount, final, _) = Totals();
        SubtotalText.Text = subtotal.ToString("0.##");
        FinalText.Text = final.ToString("0.##");
        if (discount > 0 && decimal.TryParse(DiscountBox.Text, out var typed) && typed != discount) ErrorBox.IsVisible = false;
    }

    private void OnPriceChanged(object? sender, TextChangedEventArgs e)
    {
        // The row's own binding has the text already; read it back so the totals are never a keystroke behind.
        if (sender is TextBox { DataContext: EditableBillItem item } box) item.PriceText = box.Text ?? "";
        Recalculate();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        ErrorBox.IsVisible = false;
        var (subtotal, discount, final, valid) = Totals();
        if (!valid) { Fail("Enter every price as a number (0 or more)."); return; }
        if (!string.IsNullOrWhiteSpace(DiscountBox.Text) && !decimal.TryParse(DiscountBox.Text, out _)) { Fail("Enter the discount as a number (0 for none)."); return; }

        SaveButton.IsEnabled = false;
        var asInvoice = new Invoice(_bill.Id, _bill.InvoiceNumber, _bill.PatientId, _bill.TotalAmount, _bill.PaidAmount, _bill.PaymentStatus, _bill.CreatedAt, _bill.Discount);
        var result = await BillingAdmin.EditAsync(_api, _organizationId, _userId, _isAdmin, asInvoice, _items.Select(i => new BillingAdmin.EditedItem(i.Id, i.Price!.Value, i.Quantity)).ToList(), discount);
        if (!result.Ok) { Fail(result.Error ?? "The bill was not saved."); SaveButton.IsEnabled = true; return; }

        var status = _bill.PaidAmount >= final ? "paid" : _bill.PaidAmount > 0 ? "partial" : "pending";
        Saved = asInvoice with { TotalAmount = final, Discount = discount, PaymentStatus = status }; // what this PC shows until the next sync confirms it
        Close();
    }

    private void Fail(string text) { ErrorText.Text = text; ErrorBox.IsVisible = true; }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
