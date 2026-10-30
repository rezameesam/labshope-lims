using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class CategoryDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly IReadOnlyList<string> _existing;

    /// <summary>True when the server accepted the category.</summary>
    public bool Saved { get; private set; }

    public CategoryDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    public CategoryDialog(SupabaseApi api, string organizationId, IReadOnlyList<string> existingNames)
    {
        _api = api;
        _organizationId = organizationId;
        _existing = existingNames;
        InitializeComponent();
        Opened += (_, _) => NameBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var result = await CatalogManage.AddCategoryAsync(_api, _organizationId, NameBox.Text ?? "", DescriptionBox.Text ?? "", _existing);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
