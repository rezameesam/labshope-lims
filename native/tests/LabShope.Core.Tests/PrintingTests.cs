using System.Net;
using System.Net.Sockets;
using System.Text;
using LabShope.Core.Data;
using LabShope.Core.Printing;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class PrintingTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    public PrintingTests() => _store = new LocalStore(_path);

    private static Receipt Sample(decimal discount = 0m, bool provisional = false, string patient = "Asha Rao") =>
        new("pay-1", "INV-0042", provisional, patient, 650m, 400m, 400m, 250m, "partial", "upi", new DateTimeOffset(2026, 10, 29, 9, 30, 0, TimeSpan.Zero).ToString("O"), discount);

    /// <summary>The characters a printer would actually print: the commands (ESC @, ESC a n, ESC E n, GS ! n, GS V B n) removed.</summary>
    private static string Printed(byte[] data)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < data.Length; i++)
        {
            if (data[i] == 0x1B) { i += data[i + 1] == 0x40 ? 1 : 2; continue; }
            if (data[i] == 0x1D) { i += data[i + 1] == 0x56 ? 3 : 2; continue; }
            sb.Append((char)data[i]);
        }
        return sb.ToString();
    }

    private static string Text(byte[] data) => Encoding.ASCII.GetString(data.Select(b => b is >= 0x20 and <= 0x7E or 0x0A ? b : (byte)'~').ToArray());

    [Fact]
    public void AReceiptStartsWithAResetEndsWithACutAndCarriesTheAmounts()
    {
        var bytes = EscPos.Receipt(Sample(discount: 50m), "Sunrise Diagnostics");

        Assert.Equal([0x1B, 0x40], bytes[..2]);   // ESC @ : reset the printer
        Assert.Equal([0x1D, 0x56, 0x42, 0x03], bytes[^4..]); // GS V : cut
        var text = Text(bytes);
        Assert.Contains("INV-0042", text);
        Assert.Contains("Price", text); Assert.Contains("700.00", text); // 650 + 50 discount
        Assert.Contains("-50.00", text);
        Assert.Contains("Received (upi)", text); Assert.Contains("400.00", text);
        Assert.Contains("Balance due", text); Assert.Contains("250.00", text);
        Assert.Contains("PART PAYMENT", text);
        Assert.Contains("Sunrise Diagnostics", text);
    }

    [Fact]
    public void NoPrintedLineIsWiderThanThePaperAndUnprintableCharactersBecomeQuestionMarks()
    {
        var bytes = EscPos.Receipt(Sample(patient: "रमेश कुमार ₹ Ramesh Kumar With A Very Long Name Indeed Yes"), "Lab", new Branding("Lab", "t", ["12 Long Street Name, Some Very Long Locality Name, City 400001"], "9999999999", null, null, "t", "f"), columns: 32);

        foreach (var line in Printed(bytes).Split('\n')) Assert.True(line.Length <= 32, $"too wide: '{line}'");
        Assert.DoesNotContain(bytes, b => b > 0x7E && b is not (0x80)); // plain ASCII apart from the commands
        Assert.Contains("?", Text(bytes)); // the Devanagari and the rupee sign
        Assert.Contains("Ramesh Kumar", Text(bytes));
    }

    [Fact]
    public void AProvisionalReceiptSaysSo() => Assert.Contains("Provisional receipt", Text(EscPos.Receipt(Sample(provisional: true), "Lab")));

    [Theory]
    [InlineData("Total", "100.00", 20, "Total          100.00")]
    [InlineData("A very long label here", "9.00", 16, "A very lo...9.00")]
    public void RowsFillTheWidthExactlyAndKeepTheValueWhole(string label, string value, int columns, string _)
    {
        var row = EscPos.Row(label, value, columns);
        Assert.Equal(columns, row.Length);
        Assert.EndsWith(value, row);
    }

    [Fact]
    public void LongTextWrapsOnWordsAndSplitsWordsLongerThanTheLine()
    {
        Assert.Equal(["Plot 12, MG Road", "Bengaluru"], EscPos.Wrap("Plot 12, MG Road Bengaluru", 16));
        Assert.Equal(["ABCDEFGH", "IJKLMNOP", "QR"], EscPos.Wrap("ABCDEFGHIJKLMNOPQR", 8));
    }

    [Fact]
    public void SettingsAreCheckedAndRemembered()
    {
        Assert.Null(new PrinterSettings().Problem());
        Assert.Contains("network address", new PrinterSettings(PrinterMode.Network).Problem());
        Assert.Contains("serial", new PrinterSettings(PrinterMode.Serial).Problem());
        Assert.Contains("Characters per line", new PrinterSettings(Columns: 5).Problem());

        new PrinterSettings(PrinterMode.Network, "192.168.1.50", 9100, Columns: 32).Save(_store);
        var back = PrinterSettings.Load(_store);
        Assert.Equal((PrinterMode.Network, "192.168.1.50", 32), (back.Mode, back.Host, back.Columns));
        Assert.Equal(PrinterMode.Browser, PrinterSettings.Load(new LocalStore(Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db"))).Mode);
    }

    [Fact]
    public async Task ReceiptBytesReachAPrinterListeningOnTheNetwork()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var accepted = Task.Run(async () =>
            {
                using var client = await listener.AcceptTcpClientAsync();
                using var ms = new MemoryStream();
                await client.GetStream().CopyToAsync(ms);
                return ms.ToArray();
            });

            var data = EscPos.Receipt(Sample(), "Lab");
            var outcome = await RawPrinter.SendAsync(new PrinterSettings(PrinterMode.Network, "127.0.0.1", port), data);

            Assert.True(outcome.Ok, outcome.Error);
            Assert.Equal(data, await accepted.WaitAsync(TimeSpan.FromSeconds(5)));
        }
        finally { listener.Stop(); }
    }

    [Fact]
    public async Task ExplainsAPrinterThatIsOffOrNotConfigured()
    {
        var closed = new TcpListener(IPAddress.Loopback, 0);
        closed.Start();
        var port = ((IPEndPoint)closed.LocalEndpoint).Port;
        closed.Stop(); // nothing listens here any more

        var off = await RawPrinter.SendAsync(new PrinterSettings(PrinterMode.Network, "127.0.0.1", port), [1]);
        Assert.False(off.Ok);
        // A closed port normally refuses at once, but on a busy machine the connection can instead be dropped or time out: both are "can't reach it".
        Assert.True(off.Error!.Contains("Can't reach the printer") || off.Error.Contains("did not answer"), off.Error);

        Assert.Contains("network address", (await RawPrinter.SendAsync(new PrinterSettings(PrinterMode.Network), [1])).Error);
        Assert.Contains("not turned on", (await RawPrinter.SendAsync(new PrinterSettings(), [1])).Error);
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
