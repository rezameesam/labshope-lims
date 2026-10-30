using System.Net;
using System.Text;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>
/// A printable, itemised invoice on A4 (the website's "Print Invoice"): the lab's details, the patient, every test with its price, the discount,
/// the payments received and the balance. A self-contained page, printed through the browser like reports.
/// </summary>
public static class InvoiceHtml
{
    public static string Build(BillRow bill, Patient? patient, BillDetails details, Branding branding)
    {
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        string M(decimal v) => "₹" + v.ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("en-IN"));

        var subtotal = details.Items.Sum(i => i.Amount);
        var discount = bill.Discount;
        var status = bill.Balance <= 0 ? "PAID" : bill.PaidAmount > 0 ? "PART PAID" : "UNPAID";

        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"><title>Invoice ").Append(E(bill.InvoiceNumber)).Append("</title><style>")
          .Append("@page{size:A4;margin:14mm}body{font:13px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#0F172A;max-width:182mm;margin:0 auto}")
          .Append(".head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #1E3A8A;padding-bottom:10px}")
          .Append("h1{font-size:20px;margin:0;color:#1E3A8A}h2{font-size:15px;margin:0 0 4px}.m{color:#64748B;font-size:12px}.r{text-align:right}")
          .Append(".meta{display:flex;justify-content:space-between;gap:16px;margin:14px 0}.box{flex:1}")
          .Append("table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#EEF2FF;text-align:left;padding:6px 8px;font-size:12px}td{padding:6px 8px;border-bottom:1px solid #E2E8F0}")
          .Append("td.r,th.r{text-align:right}.tot td{border:0;padding:3px 8px}.big td{font-size:15px;font-weight:700;border-top:2px solid #1E3A8A}")
          .Append(".stamp{display:inline-block;border:2px solid;padding:2px 10px;font-weight:700;border-radius:4px;margin-top:6px}")
          .Append(".foot{margin-top:24px;text-align:center;color:#64748B;font-size:12px}</style></head><body>");

        sb.Append("<div class=\"head\"><div>");
        if (branding.LogoDataUri is { Length: > 0 } logo) sb.Append("<img src=\"").Append(E(logo)).Append("\" alt=\"\" style=\"height:48px;max-width:60mm;object-fit:contain;margin-bottom:6px\"><br>");
        sb.Append("<h2>").Append(E(branding.Name)).Append("</h2>");
        var address = string.Join(", ", branding.AddressLines);
        if (address.Length > 0) sb.Append("<div class=\"m\">").Append(E(address)).Append("</div>");
        var contact = string.Join("  ·  ", new[] { branding.Phone, branding.Email, branding.Website }.Where(x => !string.IsNullOrWhiteSpace(x)));
        if (contact.Length > 0) sb.Append("<div class=\"m\">").Append(E(contact)).Append("</div>");
        sb.Append("</div><div class=\"r\"><h1>INVOICE</h1><div><b>").Append(E(bill.InvoiceNumber)).Append("</b></div><div class=\"m\">")
          .Append(E(Dates.FromMoment(bill.CreatedAt))).Append("</div></div></div>");

        sb.Append("<div class=\"meta\"><div class=\"box\"><div class=\"m\">BILLED TO</div><b>").Append(E(patient?.FullName ?? bill.PatientName)).Append("</b><div class=\"m\">")
          .Append(E(patient?.PatientCode ?? bill.PatientCode)).Append(string.IsNullOrWhiteSpace(patient?.Phone) ? "" : "  ·  " + E(patient!.Phone)).Append("</div></div>")
          .Append("<div class=\"box r\"><div class=\"m\">STATUS</div><span class=\"stamp\" style=\"color:").Append(bill.Balance <= 0 ? "#15803D" : "#B45309").Append("\">").Append(status).Append("</span></div></div>");

        sb.Append("<table><tr><th>#</th><th>Test</th><th class=\"r\">Price</th><th class=\"r\">Qty</th><th class=\"r\">Amount</th></tr>");
        var n = 0;
        foreach (var item in details.Items)
            sb.Append("<tr><td>").Append(++n).Append("</td><td>").Append(E(item.TestName)).Append("</td><td class=\"r\">").Append(M(item.UnitPrice))
              .Append("</td><td class=\"r\">").Append(item.Quantity.ToString("0.##")).Append("</td><td class=\"r\">").Append(M(item.Amount)).Append("</td></tr>");
        if (details.Items.Count == 0) sb.Append("<tr><td colspan=\"5\" class=\"m\">No item lines were found for this bill.</td></tr>");
        sb.Append("</table>");

        sb.Append("<table class=\"tot\" style=\"width:60%;margin-left:auto\">")
          .Append("<tr><td>Subtotal</td><td class=\"r\">").Append(M(subtotal > 0 ? subtotal : bill.TotalAmount + discount)).Append("</td></tr>");
        if (discount > 0) sb.Append("<tr><td>Discount</td><td class=\"r\">-").Append(M(discount)).Append("</td></tr>");
        sb.Append("<tr class=\"big\"><td>Total</td><td class=\"r\">").Append(M(bill.TotalAmount)).Append("</td></tr>")
          .Append("<tr><td>Paid</td><td class=\"r\">").Append(M(bill.PaidAmount)).Append("</td></tr>")
          .Append("<tr><td><b>Balance due</b></td><td class=\"r\"><b>").Append(M(bill.Balance)).Append("</b></td></tr></table>");

        if (details.Payments.Count > 0)
        {
            sb.Append("<h2 style=\"margin-top:18px\">Payments received</h2><table><tr><th>Date</th><th>Method</th><th>Reference</th><th class=\"r\">Amount</th></tr>");
            foreach (var p in details.Payments)
                sb.Append("<tr><td>").Append(E(p.When)).Append("</td><td>").Append(E(p.MethodText)).Append("</td><td>").Append(E(p.TransactionId)).Append("</td><td class=\"r\">").Append(M(p.Amount)).Append("</td></tr>");
            sb.Append("</table>");
        }

        sb.Append("<div class=\"foot\">").Append(E(branding.ReportTagline)).Append("<br>Thank you for choosing our laboratory services.</div></body></html>");
        return sb.ToString();
    }
}
