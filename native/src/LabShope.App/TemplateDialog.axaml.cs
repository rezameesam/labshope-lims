using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class TemplateDialog : Window
{
    private sealed record Choice(string? Value, string Label);

    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly string? _templateId;

    /// <summary>True when the server accepted the template.</summary>
    public bool Saved { get; private set; }

    public TemplateDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    public TemplateDialog(SupabaseApi api, string organizationId, Catalog catalog, ReportTemplate? existing, string css = "")
    {
        _api = api;
        _organizationId = organizationId;
        _templateId = existing?.Id;
        InitializeComponent();
        MarkersText.Text = "Markers you can use in the header and footer: {patient_name} {patient_id} {phone} {test_name} {test_date} {report_date} {lab_name} {lab_code} {entered_by}";

        var categories = new[] { new Choice(null, "All categories") }.Concat(catalog.CategoryList.Select(c => new Choice(c.Name, c.Name))).ToList();
        var tests = new[] { new Choice(null, "All tests") }.Concat(catalog.Tests.Select(t => new Choice(t.Id, t.Name))).ToList();
        CategoryBox.ItemsSource = categories; CategoryBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(Choice.Label)); CategoryBox.SelectedIndex = 0;
        TestBox.ItemsSource = tests; TestBox.DisplayMemberBinding = new Avalonia.Data.Binding(nameof(Choice.Label)); TestBox.SelectedIndex = 0;

        if (existing is not null)
        {
            Heading.Text = "Edit report template";
            NameBox.Text = existing.Name; HeaderBox.Text = existing.HeaderTemplate; FooterBox.Text = existing.FooterTemplate; CssBox.Text = css;
            RangeBox.IsChecked = existing.IncludeNormalRange; FlagBox.IsChecked = existing.IncludeAbnormalFlag; NotesBox.IsChecked = existing.IncludeNotes;
            DefaultBox.IsChecked = existing.IsDefault;
            FormatBox.SelectedIndex = Math.Max(0, Array.IndexOf(TemplateAdmin.Formats, existing.ResultFormat));
            CategoryBox.SelectedIndex = Math.Max(0, categories.FindIndex(c => c.Value == existing.TestCategory));
            TestBox.SelectedIndex = Math.Max(0, tests.FindIndex(t => t.Value == existing.TestId));
        }
        Opened += (_, _) => NameBox.Focus();
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var format = (FormatBox.SelectedItem as ComboBoxItem)?.Tag as string ?? "table";
        var input = new TemplateInput(NameBox.Text ?? "", (CategoryBox.SelectedItem as Choice)?.Value, (TestBox.SelectedItem as Choice)?.Value, HeaderBox.Text ?? "",
            FooterBox.Text ?? "", format, RangeBox.IsChecked == true, FlagBox.IsChecked == true, NotesBox.IsChecked == true, CssBox.Text ?? "", DefaultBox.IsChecked == true);
        var result = _templateId is null ? await TemplateAdmin.AddAsync(_api, _organizationId, input) : await TemplateAdmin.UpdateAsync(_api, _organizationId, _templateId, input);
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
