using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Record stock used, or stock bought, for one item.</summary>
public partial class StockDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly string? _userId;
    private readonly InventoryItem _item;
    private readonly bool _buying;

    public bool Saved { get; private set; }

    public StockDialog() => throw new InvalidOperationException("Use the constructor with an item.");

    public StockDialog(SupabaseApi api, string organizationId, string? userId, InventoryItem item, bool buying)
    {
        _api = api; _organizationId = organizationId; _userId = userId; _item = item; _buying = buying;
        InitializeComponent();
        Title = buying ? "Stock bought" : "Stock used";
        Heading.Text = item.Name;
        Sub.Text = $"In stock: {item.CurrentStock:0.##} {item.Unit}";
        QtyLabel.Text = buying ? "QUANTITY BOUGHT" : "QUANTITY USED";
        BuyPanel.IsVisible = buying; UsePanel.IsVisible = !buying;
        CostBox.Text = item.UnitPrice.ToString("0.##");
        SaveButton.Content = buying ? "Record purchase" : "Record usage";
        Opened += (_, _) => QtyBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var result = _buying
            ? await InventoryService.RecordPurchaseAsync(_api, _organizationId, _userId, _item, QtyBox.Text ?? "", CostBox.Text ?? "", SupplierBox.Text)
            : await InventoryService.RecordUsageAsync(_api, _organizationId, _userId, _item, QtyBox.Text ?? "", NoteBox.Text);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
