using System.Text;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Printing;

/// <summary>
/// Builds a receipt in ESC/POS, the command language almost every thermal receipt printer understands (Epson, TVS, Xprinter, Rongta...),
/// so it can be sent straight to the printer without a browser or print dialog. Plain text only: no logo, and characters the printer
/// cannot show (such as the rupee sign or Indian scripts) become '?'.
/// </summary>
public static class EscPos
{
    /// <summary>Characters per line on an 80 mm printer with the default font (a 58 mm printer fits about 32).</summary>
    public const int DefaultColumns = 42;

    private static readonly byte[] Init = [0x1B, 0x40]; // ESC @
    private static readonly byte[] Left = [0x1B, 0x61, 0], Center = [0x1B, 0x61, 1];
    private static readonly byte[] BoldOn = [0x1B, 0x45, 1], BoldOff = [0x1B, 0x45, 0];
    private static readonly byte[] BigOn = [0x1D, 0x21, 0x11], BigOff = [0x1D, 0x21, 0x00]; // double width and height
    private static readonly byte[] Cut = [0x1D, 0x56, 0x42, 0x03]; // feed a little, then cut (partial)

    public static byte[] Receipt(Receipt r, string labName, Branding? branding = null, int columns = DefaultColumns)
    {
        var o = new List<byte>();
        void Raw(byte[] b) => o.AddRange(b);
        void Line(string text = "") { o.AddRange(Ascii(text)); o.Add(0x0A); }
        void Wrapped(string text) { foreach (var part in Wrap(text, columns)) Line(part); }
        string Money(decimal v) => v.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
        void Pair(string label, string value) => Line(Row(label, value, columns));
        void Rule() => Line(new string('-', columns));

        Raw(Init);
        Raw(Center); Raw(BoldOn); Raw(BigOn);
        foreach (var part in Wrap(branding?.Name ?? labName, columns / 2)) Line(part);
        Raw(BigOff); Raw(BoldOff);
        if (branding is not null)
        {
            var address = string.Join(", ", branding.AddressLines);
            if (address.Length > 0) Wrapped(address);
            if (!string.IsNullOrWhiteSpace(branding.Phone)) Line("Phone: " + branding.Phone);
        }
        Line("Payment receipt");
        Raw(Left); Rule();
        Pair("Bill no.", r.InvoiceNumber);
        Pair("Date", Dates.FromMoment(r.PaidAt));
        Pair("Patient", r.PatientName);
        Rule();
        if (r.Discount > 0) { Pair("Price", Money(r.Total + r.Discount)); Pair("Discount", "-" + Money(r.Discount)); }
        Pair("Bill total", Money(r.Total));
        Raw(BoldOn); Pair($"Received ({r.Method.Replace('_', ' ')})", Money(r.Amount)); Raw(BoldOff);
        Pair("Total paid", Money(r.Paid));
        Pair("Balance due", Money(r.Balance));
        Rule();
        Raw(Center); Raw(BoldOn); Line(r.Balance <= 0 ? "PAID IN FULL" : "PART PAYMENT"); Raw(BoldOff);
        if (r.Provisional) { Line(); Wrapped("Provisional receipt. The official bill number is issued when this computer next syncs."); }
        Line(); Line("Thank you");
        Line(); Line(); Line();
        Raw(Cut);
        return o.ToArray();
    }

    /// <summary>A short test page, to see that the printer is connected and the width is right.</summary>
    public static byte[] TestPage(string labName, int columns = DefaultColumns)
    {
        var o = new List<byte>(Init) { };
        o.AddRange(Center); o.AddRange(BoldOn); o.AddRange(Ascii(labName)); o.Add(0x0A); o.AddRange(BoldOff);
        o.AddRange(Ascii("Printer test: this line should fit exactly")); o.Add(0x0A);
        o.AddRange(Left);
        o.AddRange(Ascii(new string('=', columns))); o.Add(0x0A);
        o.AddRange(Ascii(Row("Left", "Right", columns))); o.Add(0x0A);
        o.AddRange(Ascii(new string('=', columns))); o.AddRange([0x0A, 0x0A, 0x0A]);
        o.AddRange(Cut);
        return o.ToArray();
    }

    /// <summary>"Label        value" padded to exactly <paramref name="columns"/>, the value kept whole (the label is shortened if needed).</summary>
    public static string Row(string label, string value, int columns)
    {
        value = Printable(value);
        label = Printable(label);
        var room = columns - value.Length - 1;
        if (room < 1) return value.Length > columns ? value[..columns] : value.PadLeft(columns);
        if (label.Length > room) label = label[..room];
        return label.PadRight(columns - value.Length) + value;
    }

    public static IEnumerable<string> Wrap(string text, int columns)
    {
        var line = new StringBuilder();
        foreach (var word in Printable(text).Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var w = word;
            while (w.Length > columns) { if (line.Length > 0) { yield return line.ToString(); line.Clear(); } yield return w[..columns]; w = w[columns..]; }
            if (line.Length + w.Length + (line.Length > 0 ? 1 : 0) > columns) { yield return line.ToString(); line.Clear(); }
            if (line.Length > 0) line.Append(' ');
            line.Append(w);
        }
        if (line.Length > 0) yield return line.ToString();
    }

    private static string Printable(string text) => new(text.Select(c => c is >= ' ' and <= '~' ? c : '?').ToArray());

    private static byte[] Ascii(string text) => Encoding.ASCII.GetBytes(Printable(text));
}
