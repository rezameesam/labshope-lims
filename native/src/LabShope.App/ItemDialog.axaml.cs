using System.Globalization;
using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class ItemDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly string? _itemId;

    /// <summary>True when the server accepted the item.</summary>
    public bool Saved { get; private set; }

    public ItemDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    public ItemDialog(SupabaseApi api, string organizationId, InventoryItem? existing, string description = "")
    {
        _api = api;
        _organizationId = organizationId;
        _itemId = existing?.Id;
        InitializeComponent();
        if (existing is not null)
        {
            Heading.Text = "Edit item";
            NameBox.Text = existing.Name; SkuBox.Text = existing.Sku; UnitBox.Text = existing.Unit;
            StockBox.Text = existing.CurrentStock.ToString("0.##", CultureInfo.InvariantCulture); StockBox.IsEnabled = false;
            StockLabel.Text = "CURRENT STOCK"; StockNote.IsVisible = true;
            MinBox.Text = existing.MinStock.ToString("0.##", CultureInfo.InvariantCulture); PriceBox.Text = existing.UnitPrice.ToString("0.##", CultureInfo.InvariantCulture);
            SupplierBox.Text = existing.Supplier; LocationBox.Text = existing.Location; DescriptionBox.Text = description;
            TypeBox.SelectedIndex = existing.Type == "equipment" ? 1 : 0;
        }
        Opened += (_, _) => NameBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var type = (TypeBox.SelectedItem as ComboBoxItem)?.Tag as string ?? "supply";
        var input = new InventoryItemInput(NameBox.Text ?? "", type, SkuBox.Text ?? "", UnitBox.Text ?? "", StockBox.Text ?? "", MinBox.Text ?? "", PriceBox.Text ?? "",
            SupplierBox.Text ?? "", LocationBox.Text ?? "", DescriptionBox.Text ?? "");
        var result = _itemId is null ? await InventoryItemAdmin.AddAsync(_api, _organizationId, input) : await InventoryItemAdmin.UpdateAsync(_api, _organizationId, _itemId, input);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
