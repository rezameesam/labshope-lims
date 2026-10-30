using System.Globalization;
using System.Text;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>
/// Spreadsheet export (the website's Lab Sheets "Export"): a .csv that Excel, Numbers and LibreOffice open.
/// Cells that start with = + - or @ get a leading quote so a name like "=cmd" can't run as a formula.
/// </summary>
public static class CsvExport
{
    public static string Build(IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string>> rows)
    {
        var sb = new StringBuilder();
        sb.Append(string.Join(",", headers.Select(Cell))).Append("\r\n");
        foreach (var row in rows) sb.Append(string.Join(",", row.Select(Cell))).Append("\r\n");
        return sb.ToString();
    }

    public static string Cell(string? value)
    {
        var text = value ?? "";
        if (text.Length > 0 && text[0] is '=' or '+' or '-' or '@' && !decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out _)) text = "'" + text;
        return text.IndexOfAny([',', '"', '\r', '\n']) >= 0 ? "\"" + text.Replace("\"", "\"\"") + "\"" : text;
    }

    public static string Bills(IEnumerable<BillRow> bills) => Build(
        ["Invoice", "Date", "Patient", "Patient ID", "Amount", "Discount", "Paid", "Due", "Status"],
        bills.Select(b => (IReadOnlyList<string>)[b.InvoiceNumber, b.Date, b.PatientName, b.PatientCode, Num(b.TotalAmount), Num(b.Discount), Num(b.PaidAmount), Num(b.Balance), b.PaymentStatus]));

    public static string Patients(IEnumerable<Patient> patients) => Build(
        ["Patient ID", "Name", "Phone", "Email", "Gender", "Date of birth"],
        patients.Select(p => (IReadOnlyList<string>)[p.PatientCode, p.FullName, p.Phone, p.Email ?? "", p.Gender ?? "", p.BirthDate]));

    private static string Num(decimal d) => d.ToString("0.##", CultureInfo.InvariantCulture);

    /// <summary>The bytes to save: UTF-8 with a byte-order mark so Excel reads names in any script correctly.</summary>
    public static byte[] ToFileBytes(string csv) => [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(csv)];
}
