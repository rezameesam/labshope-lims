using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class TestEditDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly CatalogTest _test;

    /// <summary>True when the server accepted the change.</summary>
    public bool Saved { get; private set; }

    public TestEditDialog() => throw new InvalidOperationException("Use the constructor with a test.");

    public TestEditDialog(SupabaseApi api, string organizationId, CatalogTest test, bool active = true)
    {
        _api = api;
        _organizationId = organizationId;
        _test = test;
        InitializeComponent();
        Heading.Text = test.Name;
        PriceBox.Text = test.Price.ToString("0.##");
        UnitBox.Text = test.Unit;
        MinBox.Text = test.NormalMin is { } lo ? LabShope.Core.Data.ResultFormat.Number(lo) : null;
        MaxBox.Text = test.NormalMax is { } hi ? LabShope.Core.Data.ResultFormat.Number(hi) : null;
        RangeBox.Text = test.NormalRangeText;
        ActiveBox.IsChecked = active;
        Opened += (_, _) => { PriceBox.Focus(); PriceBox.SelectAll(); };
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var result = await CatalogAdmin.UpdateTestAsync(_api, _organizationId, _test.Id,
            new TestEdit(PriceBox.Text ?? "", UnitBox.Text ?? "", MinBox.Text ?? "", MaxBox.Text ?? "", RangeBox.Text ?? "", ActiveBox.IsChecked == true));
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
