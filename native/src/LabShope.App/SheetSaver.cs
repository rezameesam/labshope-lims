using Avalonia.Controls;
using Avalonia.Platform.Storage;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Asks where to save a spreadsheet (.csv) and writes it.</summary>
public static class SheetSaver
{
    /// <returns>The saved file's name, or null if the person cancelled.</returns>
    public static async Task<string?> SaveAsync(Control owner, string suggestedName, string csv)
    {
        if (TopLevel.GetTopLevel(owner) is not { } top) return null;
        var file = await top.StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions
        {
            Title = "Save spreadsheet",
            SuggestedFileName = suggestedName,
            DefaultExtension = "csv",
            FileTypeChoices = [new FilePickerFileType("Spreadsheet (CSV)") { Patterns = ["*.csv"] }],
        });
        if (file is null) return null;
        await using var stream = await file.OpenWriteAsync();
        stream.SetLength(0);
        await stream.WriteAsync(CsvExport.ToFileBytes(csv));
        return file.Name;
    }
}
