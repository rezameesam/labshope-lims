using System.Diagnostics;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Opens a receipt in the system browser, ready to print (Ctrl/Cmd+P) on any printer.</summary>
public static class ReceiptPrinter
{
    public static void Open(Receipt receipt, string labName)
    {
        var dir = Path.Combine(AppConfig.DataDirectory, "receipts");
        Directory.CreateDirectory(dir);
        var file = Path.Combine(dir, $"receipt-{receipt.InvoiceNumber}-{receipt.PaymentId[..8]}.html");
        File.WriteAllText(file, ReceiptHtml.Build(receipt, labName));
        Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
    }
}
