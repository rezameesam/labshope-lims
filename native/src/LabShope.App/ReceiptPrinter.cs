using System.Diagnostics;
using LabShope.Core.Data;
using LabShope.Core.Printing;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>
/// Prints receipts straight to the receipt printer when one is set up (Sync &amp; settings), otherwise, or when the printer can't be reached,
/// opens a printable page in the system browser. Reports and labels always use the browser page.
/// </summary>
public static class ReceiptPrinter
{
    private static LocalStore? _store;

    /// <summary>Raised (on any thread) when direct printing failed and the receipt was opened in the browser instead.</summary>
    public static event Action<string>? PrintProblem;

    public static void Configure(LocalStore store) => _store = store;

    public static void Open(Receipt receipt, string labName, Branding? branding = null)
    {
        var settings = _store is null ? new PrinterSettings() : PrinterSettings.Load(_store);
        if (settings.Mode == PrinterMode.Browser || settings.Problem() is not null) { OpenPage(receipt, labName, branding); return; }

        _ = Task.Run(async () =>
        {
            var outcome = await RawPrinter.SendAsync(settings, EscPos.Receipt(receipt, labName, branding, settings.Columns));
            if (outcome.Ok) return;
            LabShope.Core.AppLog.Info($"Direct receipt printing failed: {outcome.Error}");
            PrintProblem?.Invoke(outcome.Error + " The receipt was opened in the browser instead.");
            Avalonia.Threading.Dispatcher.UIThread.Post(() => OpenPage(receipt, labName, branding));
        });
    }

    private static void OpenPage(Receipt receipt, string labName, Branding? branding) =>
        OpenHtml($"receipt-{receipt.InvoiceNumber}-{receipt.PaymentId[..8]}", ReceiptHtml.Build(receipt, labName, branding));

    public static void OpenHtml(string name, string html)
    {
        var dir = Path.Combine(AppConfig.DataDirectory, "print");
        Directory.CreateDirectory(dir);
        var file = Path.Combine(dir, string.Concat(name.Select(c => char.IsLetterOrDigit(c) || c is '-' or '_' ? c : '_')) + ".html");
        File.WriteAllText(file, html);
        Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
    }
}
