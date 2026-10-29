using System.Diagnostics;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Opens printable pages (receipts, reports) in the system browser, ready to print on any printer.</summary>
public static class ReceiptPrinter
{
    public static void Open(Receipt receipt, string labName, LabShope.Core.Data.Branding? branding = null) =>
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
