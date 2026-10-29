using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class NewTestDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly IReadOnlyList<string?> _existingCodes;
    private static readonly TestCategory NoCategory = new("", "(none)");

    /// <summary>True when the server accepted the new test.</summary>
    public bool Saved { get; private set; }

    public NewTestDialog() => throw new InvalidOperationException("Use the constructor with a catalog.");

    public NewTestDialog(SupabaseApi api, string organizationId, Catalog catalog)
    {
        _api = api;
        _organizationId = organizationId;
        _existingCodes = catalog.Tests.Select(t => (string?)t.TestCode).ToList();
        InitializeComponent();
        CategoryBox.ItemsSource = new[] { NoCategory }.Concat(catalog.CategoryList).ToList();
        CategoryBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(TestCategory.Name));
        CategoryBox.SelectedIndex = 0;
        Opened += (_, _) => NameBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var category = CategoryBox.SelectedItem is TestCategory { Id.Length: > 0 } c ? c.Id : null;
        var result = await CatalogAdmin.AddTestAsync(_api, _organizationId,
            new CatalogAdmin.NewTest(NameBox.Text ?? "", PriceBox.Text ?? "", category, SampleBox.Text ?? "", UnitBox.Text ?? "", MinBox.Text ?? "", MaxBox.Text ?? "", RangeBox.Text ?? ""), _existingCodes);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
