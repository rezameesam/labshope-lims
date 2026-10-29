using System.Net;
using System.Text;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>
/// A printable receipt as a small self-contained HTML page (80 mm wide, prints cleanly on thermal and
/// normal printers from any browser). Works the same on macOS, Windows and Linux with nothing to install.
/// </summary>
public static class ReceiptHtml
{
    public static string Build(Receipt r, string labName, Branding? branding = null)
    {
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        string M(decimal v) => v.ToString("0.00");

        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"><title>Receipt ").Append(E(r.InvoiceNumber)).Append("</title><style>")
          .Append("@page{size:80mm auto;margin:4mm}body{font:13px/1.35 -apple-system,Segoe UI,Arial,sans-serif;width:72mm;margin:0 auto;color:#000}")
          .Append("h1{font-size:16px;text-align:center;margin:0 0 2px}.c{text-align:center}.s{font-size:11px;color:#444}")
          .Append("table{width:100%;border-collapse:collapse;margin-top:6px}td{padding:2px 0}td.r{text-align:right}")
          .Append("hr{border:0;border-top:1px dashed #000;margin:6px 0}.b{font-weight:700}.w{border:1px solid #000;padding:2px 4px;margin-top:6px;font-size:11px;text-align:center}")
          .Append("@media print{.no{display:none}}</style></head><body>");
        if (branding?.LogoDataUri is { Length: > 0 } logo) sb.Append("<div class=\"c\"><img src=\"").Append(E(logo)).Append("\" alt=\"\" style=\"height:34px;max-width:60mm;object-fit:contain\"></div>");
        sb.Append("<h1>").Append(E(branding?.Name ?? labName)).Append("</h1>");
        if (branding is not null)
        {
            var contact = string.Join(", ", branding.AddressLines);
            if (contact.Length > 0) sb.Append("<div class=\"c s\">").Append(E(contact)).Append("</div>");
            if (!string.IsNullOrWhiteSpace(branding.Phone)) sb.Append("<div class=\"c s\">Phone: ").Append(E(branding.Phone)).Append("</div>");
        }
        sb.Append("<div class=\"c s\">Payment receipt</div><hr>");
        sb.Append("<table><tr><td>Bill no.</td><td class=\"r b\">").Append(E(r.InvoiceNumber)).Append("</td></tr>")
          .Append("<tr><td>Date</td><td class=\"r\">").Append(E(DateTimeOffset.Parse(r.PaidAt).ToLocalTime().ToString("dd MMM yyyy HH:mm"))).Append("</td></tr>")
          .Append("<tr><td>Patient</td><td class=\"r\">").Append(E(r.PatientName)).Append("</td></tr></table><hr>");
        sb.Append("<table><tr><td>Bill total</td><td class=\"r\">").Append(M(r.Total)).Append("</td></tr>")
          .Append("<tr><td class=\"b\">Received (").Append(E(r.Method.Replace('_', ' '))).Append(")</td><td class=\"r b\">").Append(M(r.Amount)).Append("</td></tr>")
          .Append("<tr><td>Total paid</td><td class=\"r\">").Append(M(r.Paid)).Append("</td></tr>")
          .Append("<tr><td>Balance due</td><td class=\"r\">").Append(M(r.Balance)).Append("</td></tr></table>");
        sb.Append("<div class=\"c b\" style=\"margin-top:6px\">").Append(r.Balance <= 0 ? "PAID IN FULL" : "PART PAYMENT").Append("</div>");
        if (r.Provisional) sb.Append("<div class=\"w\">Provisional receipt. The official bill number is issued when this computer next syncs.</div>");
        sb.Append("<hr><div class=\"c s\">Thank you</div></body></html>");
        return sb.ToString();
    }
}
