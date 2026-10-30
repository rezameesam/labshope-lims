using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class PackageDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly Catalog _catalog;
    private readonly string? _packageId;
    private readonly HashSet<string> _chosen = [];
    private bool _filling;

    /// <summary>True when the server accepted the package.</summary>
    public bool Saved { get; private set; }

    public PackageDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    /// <summary>A new package (<paramref name="existing"/> is null) or an edit of <paramref name="package"/> with details read from the server.</summary>
    public PackageDialog(SupabaseApi api, string organizationId, Catalog catalog, TestPackage? package, PackageInput? existing)
    {
        _api = api;
        _organizationId = organizationId;
        _catalog = catalog;
        _packageId = package?.Id;
        InitializeComponent();
        if (existing is not null)
        {
            Heading.Text = "Edit package";
            NameBox.Text = existing.Name; DescriptionBox.Text = existing.Description; DiscountBox.Text = existing.DiscountPercent;
            ActiveBox.IsChecked = existing.Active;
            foreach (var id in existing.TestIds) _chosen.Add(id);
        }
        TestList.SelectionChanged += OnPick;
        SearchBox.TextChanged += (_, _) => Fill();
        DiscountBox.TextChanged += (_, _) => UpdatePrice();
        Fill();
        Opened += (_, _) => NameBox.Focus();
    }

    private void Fill()
    {
        var words = (SearchBox.Text ?? "").Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var shown = _catalog.Tests.Where(t => words.All(w => t.Name.Contains(w, StringComparison.OrdinalIgnoreCase) || (t.TestCode ?? "").Contains(w, StringComparison.OrdinalIgnoreCase))).ToList();
        _filling = true;
        TestList.ItemsSource = shown;
        TestList.ItemTemplate = new Avalonia.Controls.Templates.FuncDataTemplate<CatalogTest>((t, _) => new TextBlock { Text = $"{t.Name}   ₹{t.Price:0.##}" });
        TestList.SelectedItems!.Clear();
        foreach (var t in shown.Where(t => _chosen.Contains(t.Id))) TestList.SelectedItems.Add(t);
        _filling = false;
        UpdatePrice();
    }

    private void OnPick(object? sender, SelectionChangedEventArgs e)
    {
        if (_filling) return;
        foreach (var t in e.AddedItems.OfType<CatalogTest>()) _chosen.Add(t.Id);
        foreach (var t in e.RemovedItems.OfType<CatalogTest>()) _chosen.Remove(t.Id);
        UpdatePrice();
    }

    private void UpdatePrice()
    {
        var prices = _catalog.Tests.Where(t => _chosen.Contains(t.Id)).Select(t => t.Price).ToList();
        var ok = decimal.TryParse((DiscountBox.Text ?? "").Trim() is { Length: > 0 } d ? d : "0", System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var discount) && discount is >= 0 and <= 100;
        PriceText.Text = $"{prices.Count} test(s) chosen  ·  " + (ok ? $"package price ₹{CatalogManage.PackagePrice(prices, discount):0.##} (tests ₹{prices.Sum():0.##})" : "enter a discount from 0 to 100");
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var input = new PackageInput(NameBox.Text ?? "", DescriptionBox.Text ?? "", DiscountBox.Text ?? "", _chosen.ToList(), ActiveBox.IsChecked == true);
        var result = _packageId is null
            ? await CatalogManage.AddPackageAsync(_api, _organizationId, input, _catalog)
            : await CatalogManage.UpdatePackageAsync(_api, _organizationId, _packageId, input, _catalog);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
