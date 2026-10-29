using System.Net;
using System.Text;
using LabShope.Core.Data;
using LabShope.Core.Scanning;

namespace LabShope.Core.Visits;

public sealed record LabelData(string LabName, string PatientName, string PatientCode, string? AgeSex, string BillNumber, string Date, IReadOnlyList<string> Tests, int Copies = 1);

public static class LabelBuilder
{
    /// <summary>The sample label for a visit: who, which bill, which tests. The barcode carries the patient's code.</summary>
    public static LabelData? ForVisit(LocalStore store, string labName, string visitId, int copies = 1)
    {
        var bill = store.GetInvoice(visitId);
        var patient = bill is null ? null : store.GetPatient(bill.PatientId);
        if (bill is null || patient is null) return null;

        var tests = store.SearchWorklist("", null, 5000).Where(r => r.Test.PatientId == patient.Id && r.Test.TestDate == DateTimeOffset.Parse(bill.CreatedAt).ToLocalTime().ToString("yyyy-MM-dd")).Select(r => r.TestName).ToList();
        var agesex = string.Join(" / ", new[] { Age(patient.DateOfBirth), patient.Gender }.Where(x => !string.IsNullOrWhiteSpace(x)));
        return new LabelData(labName, patient.FullName, patient.PatientCode, agesex.Length == 0 ? null : agesex, bill.InvoiceNumber,
            DateTimeOffset.Parse(bill.CreatedAt).ToLocalTime().ToString("dd MMM yyyy"), tests, Math.Clamp(copies, 1, 20));
    }

    private static string? Age(string? dob) => DateTime.TryParse(dob, out var d) ? $"{Math.Max(DateTime.Today.Year - d.Year, 0)} y" : null;
}

/// <summary>Sample-tube labels (50 x 25 mm, one per page) with a Code 128 barcode. A scanner reads the code and the app opens the patient.</summary>
public static class LabelHtml
{
    public static string Build(LabelData d)
    {
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        var tests = string.Join(", ", d.Tests);
        if (tests.Length > 60) tests = tests[..57] + "...";

        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"><title>Labels ").Append(E(d.PatientName)).Append("</title><style>")
          .Append("@page{size:50mm 25mm;margin:0}*{box-sizing:border-box}body{margin:0;font:8px/1.15 -apple-system,Segoe UI,Arial,sans-serif;color:#000}")
          .Append(".l{width:50mm;height:25mm;padding:1.5mm 2mm;page-break-after:always;overflow:hidden}.l:last-child{page-break-after:auto}")
          .Append(".n{font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.s{display:flex;justify-content:space-between;white-space:nowrap}")
          .Append(".bc svg{display:block;width:100%;height:9mm}.t{font-size:7px;color:#222;max-height:8px;overflow:hidden}.c{text-align:center;font-size:9px;font-weight:700;letter-spacing:.5px}")
          .Append("@media screen{body{background:#eee;padding:8px}.l{background:#fff;margin:0 0 8px;border:1px dashed #999}}")
          .Append("</style></head><body>");

        var canBar = Code128.CanEncode(d.PatientCode);
        for (var i = 0; i < d.Copies; i++)
        {
            sb.Append("<div class=\"l\"><div class=\"s\"><span>").Append(E(d.LabName)).Append("</span><span>").Append(E(d.Date)).Append("</span></div>")
              .Append("<div class=\"n\">").Append(E(d.PatientName)).Append("</div>")
              .Append("<div class=\"s\"><span>").Append(E(d.AgeSex)).Append("</span><span>Bill ").Append(E(d.BillNumber)).Append("</span></div>");
            if (canBar) sb.Append("<div class=\"bc\">").Append(Code128.ToSvg(d.PatientCode, 2, 40)).Append("</div>");
            sb.Append("<div class=\"c\">").Append(E(d.PatientCode)).Append("</div><div class=\"t\">").Append(E(tests)).Append("</div></div>");
        }
        sb.Append("</body></html>");
        return sb.ToString();
    }
}
