using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Reagents and consumables: stock levels with low-stock warnings, and recording stock used or bought. Needs the internet.</summary>
public partial class InventoryView : UserControl
{
    private readonly AppSession _session;
    private IReadOnlyList<InventoryItem> _items = [];
    private bool _loadedOnce;

    public InventoryView() => throw new InvalidOperationException("Use the constructor with a session.");

    public InventoryView(AppSession session)
    {
        _session = session;
        InitializeComponent();
        NewItemButton.IsVisible = EditItemButton.IsVisible = SwitchOffItemButton.IsVisible = CanManage;
        SearchBox.TextChanged += (_, _) => ApplyFilter();
        LowOnly.IsCheckedChanged += (_, _) => ApplyFilter();
    }

    public async Task EnsureLoadedAsync() { if (!_loadedOnce) await LoadAsync(); }
    private async void OnRefresh(object? sender, RoutedEventArgs e) => await LoadAsync();

    public async Task LoadAsync()
    {
        _loadedOnce = true;
        if (_session.Api is null) return;
        var result = await InventoryService.LoadAsync(_session.Api, _session.Workspace.OrganizationId);
        MessageCard.IsVisible = result.Error is not null;
        MessageText.Text = result.Error;
        if (result.Error is null) _items = result.Items;
        ApplyFilter();
    }

    private void ApplyFilter()
    {
        var words = (SearchBox.Text ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var rows = _items.Where(i => words.All(w => i.Name.Contains(w, StringComparison.OrdinalIgnoreCase) || (i.Sku ?? "").Contains(w, StringComparison.OrdinalIgnoreCase))
                                     && (LowOnly.IsChecked != true || i.Low)).ToList();
        Grid.ItemsSource = rows;
        CountText.Text = $"{rows.Count} item(s)" + (_items.Any(i => i.Low) ? $"  ·  {_items.Count(i => i.Low)} low or out" : "");
    }

    private bool CanManage => _session.Api is not null && _session.Workspace.IsAdmin;

    private Window Owner => (Window)TopLevel.GetTopLevel(this)!;

    private async void OnNewItem(object? s, RoutedEventArgs e)
    {
        if (!CanManage || _session.Api is null) return;
        var dialog = new ItemDialog(_session.Api, _session.Workspace.OrganizationId, null);
        await dialog.ShowDialog(Owner);
        if (!dialog.Saved) return;
        DoneText.Text = "Item added.";
        await LoadAsync();
    }

    private async void OnEditItem(object? s, RoutedEventArgs e)
    {
        if (!CanManage || _session.Api is null) return;
        if (Grid.SelectedItem is not InventoryItem item) { DoneText.Text = "Pick an item first."; return; }
        var description = await InventoryItemAdmin.LoadDescriptionAsync(_session.Api, _session.Workspace.OrganizationId, item.Id);
        var dialog = new ItemDialog(_session.Api, _session.Workspace.OrganizationId, item, description);
        await dialog.ShowDialog(Owner);
        if (!dialog.Saved) return;
        DoneText.Text = $"{item.Name} updated.";
        await LoadAsync();
    }

    private async void OnSwitchOffItem(object? s, RoutedEventArgs e)
    {
        if (!CanManage || _session.Api is null) return;
        if (Grid.SelectedItem is not InventoryItem item) { DoneText.Text = "Pick an item first."; return; }
        var confirm = new ConfirmDialog($"Switch off {item.Name}?", "It disappears from this list but keeps its history. To switch it back on, use the website's Inventory page.", "Switch off");
        await confirm.ShowDialog(Owner);
        if (!confirm.Confirmed) return;
        var result = await InventoryItemAdmin.SwitchOffAsync(_session.Api, _session.Workspace.OrganizationId, item.Id);
        if (result.Ok) { DoneText.Text = $"{item.Name} switched off."; await LoadAsync(); }
        else DoneText.Text = result.Error ?? "Not changed.";
    }

    private async void OnUsed(object? s, RoutedEventArgs e) => await Record(buying: false);
    private async void OnBought(object? s, RoutedEventArgs e) => await Record(buying: true);

    private async Task Record(bool buying)
    {
        if (Grid.SelectedItem is not InventoryItem item || _session.Api is null) { DoneText.Text = "Pick an item first."; return; }
        var dialog = new StockDialog(_session.Api, _session.Workspace.OrganizationId, _session.Account.SavedUserId, item, buying);
        await dialog.ShowDialog((Window)TopLevel.GetTopLevel(this)!);
        if (!dialog.Saved) return;
        DoneText.Text = buying ? $"Purchase of {item.Name} recorded." : $"Usage of {item.Name} recorded.";
        await LoadAsync();
    }
}
