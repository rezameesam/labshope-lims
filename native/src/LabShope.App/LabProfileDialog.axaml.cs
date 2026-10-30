using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using Avalonia.Platform.Storage;
using LabShope.Core.Net;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class LabProfileDialog : Window
{
    private readonly SupabaseApi _api;
    private readonly string _organizationId;
    private readonly string? _userId;
    private LabProfileData? _before;
    private (string Name, byte[] Bytes)? _newLogo;

    /// <summary>True when the server accepted the profile (or a new logo).</summary>
    public bool Saved { get; private set; }

    public LabProfileDialog() => throw new InvalidOperationException("Use the constructor with an API.");

    public LabProfileDialog(SupabaseApi api, string organizationId, string? userId)
    {
        _api = api;
        _organizationId = organizationId;
        _userId = userId;
        InitializeComponent();
        Opened += async (_, _) => await LoadAsync();
    }

    /// <summary>Loads the current profile (the tests call this to wait for it).</summary>
    public async Task LoadAsync()
    {
        var (profile, error) = await LabProfile.LoadAsync(_api, _organizationId);
        if (profile is null) { LoadText.Text = error ?? "Could not load the lab profile."; return; }
        _before = profile;
        NameBox.Text = profile.DisplayName; PhoneBox.Text = profile.Phone; EmailBox.Text = profile.Email; WebsiteBox.Text = profile.Website;
        TaglineBox.Text = profile.Tagline; ReportTaglineBox.Text = profile.ReportTagline; FooterNoteBox.Text = profile.ReportFooterNote;
        LoadText.IsVisible = false;
        Form.IsVisible = true;
        SaveButton.IsEnabled = true;
        if (profile.LogoUrl is { Length: > 0 } url && await _api.DownloadImageAsync(url) is { } img && !url.EndsWith(".svg", StringComparison.OrdinalIgnoreCase))
        {
            try { LogoImage.Source = new Bitmap(new MemoryStream(img.Bytes)); } catch { /* an unreadable image just shows no preview */ }
        }
    }

    private async void OnChooseLogo(object? sender, RoutedEventArgs e)
    {
        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Choose the lab logo",
            AllowMultiple = false,
            FileTypeFilter = [new FilePickerFileType("Images") { Patterns = ["*.png", "*.jpg", "*.jpeg", "*.webp", "*.svg"] }],
        });
        if (files.Count == 0) return;
        await ChooseLogoAsync(files[0].Name, files[0].OpenReadAsync);
    }

    /// <summary>Takes a chosen logo file (checked before anything is sent). Separate from the picker so tests can supply a file.</summary>
    public async Task ChooseLogoAsync(string fileName, Func<Task<Stream>> open)
    {
        await using var stream = await open();
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory);
        var (type, error) = LabProfile.CheckLogo(fileName, memory.Length);
        if (type is null) { LogoText.Text = error; return; }
        _newLogo = (fileName, memory.ToArray());
        LogoText.Text = $"{fileName} will be uploaded when you save.";
        try { LogoImage.Source = new Bitmap(new MemoryStream(_newLogo.Value.Bytes)); } catch { /* SVG has no preview here */ }
    }

    private async void OnSave(object? sender, RoutedEventArgs e)
    {
        if (_before is null) return;
        SaveButton.IsEnabled = false;
        ErrorBox.IsVisible = false;
        var after = _before with
        {
            DisplayName = NameBox.Text ?? "", Phone = PhoneBox.Text ?? "", Email = EmailBox.Text ?? "", Website = WebsiteBox.Text ?? "",
            Tagline = TaglineBox.Text ?? "", ReportTagline = ReportTaglineBox.Text ?? "", ReportFooterNote = FooterNoteBox.Text ?? "",
        };
        var result = await LabProfile.SaveAsync(_api, _organizationId, _userId, _before, after);
        if (result.Ok && _newLogo is { } logo)
        {
            var (_, uploadError) = await LabProfile.UploadLogoAsync(_api, _organizationId, logo.Name, logo.Bytes);
            if (uploadError is not null) result = new AdminResult(false, "The details were saved, but the logo was not: " + uploadError);
        }
        if (result.Ok) { Saved = true; Close(); return; }
        ErrorText.Text = result.Error;
        ErrorBox.IsVisible = true;
        SaveButton.IsEnabled = true;
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
