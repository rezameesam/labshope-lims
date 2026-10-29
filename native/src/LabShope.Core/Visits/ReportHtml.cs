using System.Net;
using System.Text;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record ReportLine(string Test, string Result, string Unit, string Reference, bool Abnormal);

public sealed record ReportSection(string TestName, IReadOnlyList<ReportLine> Lines, bool IsPanel);

public sealed record ReportData(
    string LabName, string PatientName, string PatientCode, string? Gender, string? Age, string Phone,
    string ReportDate, IReadOnlyList<ReportSection> Sections, bool Provisional = false, Branding? Branding = null);

/// <summary>Builds a patient's report from the completed tests held on this PC (works offline).</summary>
public static class ReportBuilder
{
    /// <summary>All completed tests for the patient on the given date. Returns null when there is nothing to report.</summary>
    public static ReportData? For(LocalStore store, string labName, string patientId, string testDate, DateTimeOffset? now = null, Branding? branding = null)
    {
        var patient = store.GetPatient(patientId);
        if (patient is null) return null;

        var done = store.SearchWorklist("", ["completed"], limit: 5000)
            .Where(r => r.Test.PatientId == patientId && r.Test.TestDate == testDate).Select(r => r.Test).ToList();
        if (done.Count == 0) return null;

        var sections = done.Select(t => Section(store, t)).ToList();
        return new ReportData(labName, patient.FullName, patient.PatientCode, patient.Gender, AgeOf(patient.DateOfBirth, now ?? DateTimeOffset.Now),
            patient.Phone, testDate, sections, Provisional: done.Any(t => t.Waiting), Branding: branding);
    }

    private static ReportSection Section(LocalStore store, PatientTest t)
    {
        var items = ResultItem.ParseAll(t.ResultItemsJson);
        if (items.Count > 0)
        {
            var lines = items.Where(i => i.Value.Trim() != "").Select(i => new ReportLine(i.Name, i.Value, i.Unit, RangeOf(i.Min, i.Max, i.RangeText), i.IsAbnormal)).ToList();
            return new ReportSection(t.TestName, lines, IsPanel: true);
        }

        var catalog = store.FindCatalogTest(t.TestName);
        var reference = t.NormalRangeText ?? catalog?.NormalRangeText ?? RangeOf(catalog?.NormalMin?.ToString("0.##") ?? "", catalog?.NormalMax?.ToString("0.##") ?? "", null);
        var value = t.ResultValue is { } v ? v.ToString("0.##") : t.Result ?? "";
        return new ReportSection(t.TestName, [new ReportLine(t.TestName, value, t.ResultUnit ?? "", reference, t.IsAbnormal)], IsPanel: false);
    }

    private static string RangeOf(string min, string max, string? text) =>
        !string.IsNullOrWhiteSpace(text) ? text! : min != "" && max != "" ? $"{min} - {max}" : min != "" ? $">= {min}" : max != "" ? $"<= {max}" : "";

    private static string? AgeOf(string? dob, DateTimeOffset now)
    {
        if (!DateTime.TryParse(dob, out var d)) return null;
        var years = now.Year - d.Year - (now.DayOfYear < new DateTimeOffset(d).DayOfYear ? 1 : 0);
        if (years >= 1) return $"{years} y";
        var months = (now.Year - d.Year) * 12 + now.Month - d.Month - (now.Day < d.Day ? 1 : 0);
        return $"{Math.Max(months, 0)} m";
    }
}

/// <summary>A printable lab report as a self-contained HTML page (A4), the same approach as receipts: works on any OS and printer.</summary>
public static class ReportHtml
{
    public static string Build(ReportData r)
    {
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"><title>Report ").Append(E(r.PatientName)).Append("</title><style>")
          .Append("@page{size:A4;margin:14mm}body{font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:180mm;margin:0 auto}")
          .Append("h1{font-size:22px;margin:0}h2{font-size:15px;margin:18px 0 4px;border-bottom:1px solid #999;padding-bottom:2px}")
          .Append(".head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin:10px 0}")
          .Append("table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;color:#444;border-bottom:1px solid #999;padding:3px 4px}")
          .Append("td{padding:3px 4px;border-bottom:1px solid #e3e3e3}td.v{font-weight:600}.abn{font-weight:700}.abn td.v::after{content:' *'}")
          .Append(".note{margin-top:22px;font-size:11px;color:#555}.warn{margin:8px 0;padding:4px 8px;border:1px solid #b36b00;color:#b36b00;font-size:12px}")
          .Append("</style></head><body>");
        var b = r.Branding;
        sb.Append("<div class=\"head\"><div style=\"display:flex;gap:12px;align-items:center\">");
        if (b?.LogoDataUri is { Length: > 0 } logo) sb.Append("<img src=\"").Append(E(logo)).Append("\" alt=\"\" style=\"height:54px;max-width:120px;object-fit:contain\">");
        sb.Append("<div><h1>").Append(E(b?.Name ?? r.LabName)).Append("</h1>");
        if (b is not null)
        {
            if (!string.IsNullOrWhiteSpace(b.ReportTagline)) sb.Append("<div>").Append(E(b.ReportTagline)).Append("</div>");
            var contact = string.Join("  |  ", b.AddressLines.Concat(new[] { b.Phone is null ? null : "Phone: " + b.Phone, b.Email }.Where(x => !string.IsNullOrWhiteSpace(x))!));
            if (contact.Length > 0) sb.Append("<div style=\"font-size:11px;color:#444\">").Append(E(contact)).Append("</div>");
        }
        else sb.Append("<div>Laboratory report</div>");
        sb.Append("</div></div><div style=\"text-align:right\">Report date<br><b>").Append(E(r.ReportDate)).Append("</b></div></div>");
        sb.Append("<div class=\"meta\"><div>Patient: <b>").Append(E(r.PatientName)).Append("</b></div><div>Patient ID: <b>").Append(E(r.PatientCode)).Append("</b></div>")
          .Append("<div>Age / sex: ").Append(E(string.Join(" / ", new[] { r.Age, r.Gender }.Where(x => !string.IsNullOrWhiteSpace(x))))).Append("</div><div>Phone: ").Append(E(r.Phone)).Append("</div></div>");
        if (r.Provisional) sb.Append("<div class=\"warn\">Preliminary: some of these results have not been confirmed by the server yet.</div>");

        foreach (var s in r.Sections)
        {
            sb.Append("<h2>").Append(E(s.TestName)).Append("</h2><table><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th></tr>");
            foreach (var l in s.Lines)
                sb.Append("<tr").Append(l.Abnormal ? " class=\"abn\"" : "").Append("><td>").Append(E(l.Test)).Append("</td><td class=\"v\">").Append(E(l.Result))
                  .Append("</td><td>").Append(E(l.Unit)).Append("</td><td>").Append(E(l.Reference)).Append("</td></tr>");
            sb.Append("</table>");
        }
        sb.Append("<div class=\"note\">* Outside the reference range. ").Append(E(r.Branding?.ReportFooterNote ?? "This is a computer generated report.")).Append("</div></body></html>");
        return sb.ToString();
    }
}
