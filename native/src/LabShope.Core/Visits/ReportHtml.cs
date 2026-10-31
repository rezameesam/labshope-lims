using System.Net;
using System.Text;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record ReportLine(string Test, string Result, string Unit, string Reference, bool Abnormal);

public sealed record ReportSection(string TestName, IReadOnlyList<ReportLine> Lines, bool IsPanel);

public sealed record ReportData(
    string LabName, string PatientName, string PatientCode, string? Gender, string? Age, string Phone,
    string ReportDate, IReadOnlyList<ReportSection> Sections, bool Provisional = false, Branding? Branding = null,
    string? HeaderText = null, string? FooterText = null, bool ShowReference = true, bool ShowFlag = true, bool ListFormat = false, string? EnteredBy = null);

/// <summary>Builds a patient's report from the completed tests held on this PC (works offline).</summary>
public static class ReportBuilder
{
    /// <summary>All completed tests for the patient on the given date. Returns null when there is nothing to report.</summary>
    public static ReportData? For(LocalStore store, string labName, string patientId, string testDate, DateTimeOffset? now = null, Branding? branding = null, string? organizationId = null, string? labId = null)
    {
        var patient = store.GetPatient(patientId);
        if (patient is null) return null;

        var done = store.SearchWorklist("", ["completed"], limit: 5000)
            .Where(r => r.Test.PatientId == patientId && r.Test.TestDate == testDate).Select(r => r.Test).ToList();
        if (done.Count == 0) return null;

        var sections = done.Select(t => Section(store, t)).ToList();

        // The lab's own report layout (header/footer wording, what to show), chosen like the website does.
        var catalog = store.GetCatalog();
        var template = organizationId is null ? null : ReportTemplates.Resolve(catalog, organizationId, done.Select(t => t.TestName).Distinct().ToList());
        var context = new Dictionary<string, string>
        {
            ["patient_name"] = patient.FullName, ["patient_id"] = patient.PatientCode, ["phone"] = patient.Phone,
            ["test_name"] = done.Select(t => t.TestName).Distinct().Count() == 1 ? done[0].TestName : "Multiple Tests",
            ["test_date"] = testDate, ["report_date"] = testDate, ["lab_name"] = branding?.Name ?? labName,
            ["lab_code"] = catalog.Labs.FirstOrDefault(l => l.Id == labId)?.LabCode ?? "", ["collection_center"] = "", ["entered_by"] = branding?.Name ?? labName,
        };
        var header = template?.HeaderTemplate is { Length: > 0 } h ? ReportTemplates.RenderText(h, context) : null;
        var footer = template?.FooterTemplate is { Length: > 0 } f ? ReportTemplates.RenderText(f, context) : null;

        return new ReportData(labName, patient.FullName, patient.PatientCode, patient.Gender, PatientAge.Of(patient.DateOfBirth, DateOnly.FromDateTime((now ?? DateTimeOffset.Now).LocalDateTime)),
            patient.Phone, testDate, sections, Provisional: done.Any(t => t.Waiting), Branding: branding,
            HeaderText: header, FooterText: footer, ShowReference: template?.IncludeNormalRange ?? true, ShowFlag: template?.IncludeAbnormalFlag ?? true,
            ListFormat: string.Equals(template?.ResultFormat, "list", StringComparison.OrdinalIgnoreCase));
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
        var reference = t.NormalRangeText ?? catalog?.NormalRangeText ?? RangeOf(catalog?.NormalMin is { } lo ? ResultFormat.Number(lo) : "", catalog?.NormalMax is { } hi ? ResultFormat.Number(hi) : "", null);
        var value = t.ResultValue is { } v ? ResultFormat.Number(v) : t.Result ?? "";
        return new ReportSection(t.TestName, [new ReportLine(t.TestName, value, t.ResultUnit ?? "", reference, t.IsAbnormal)], IsPanel: false);
    }

    private static string RangeOf(string min, string max, string? text) =>
        !string.IsNullOrWhiteSpace(text) ? text! : min != "" && max != "" ? $"{min} - {max}" : min != "" ? $">= {min}" : max != "" ? $"<= {max}" : "";

}

/// <summary>A printable lab report as a self-contained HTML page (A4), the same approach as receipts: works on any OS and printer.</summary>
/// <summary>What to print on a report. Turn the header, footer and watermark off for pre-printed letterhead paper.</summary>
public sealed record ReportOptions(bool IncludeHeader = true, bool IncludeFooter = true, bool IncludeWatermark = true)
{
    private const string Key = "report_print_options";

    /// <summary>The choice made last time on this PC (everything on the first time, like the website).</summary>
    public static ReportOptions Load(LocalStore store)
    {
        try { return store.GetMeta(Key) is { } json ? System.Text.Json.JsonSerializer.Deserialize<ReportOptions>(json) ?? new() : new(); }
        catch (System.Text.Json.JsonException) { return new(); }
    }

    public void Save(LocalStore store) => store.SetMeta(Key, System.Text.Json.JsonSerializer.Serialize(this));
}

public static class ReportHtml
{
    /// <summary>
    /// The same layout as the website's PDF report: blue header band (logo, lab name, address, phone, email), PATIENT INFORMATION in two columns,
    /// TEST RESULTS as a striped table with a status icon (or the list form some templates ask for), who entered the results, the lab's closing text,
    /// and a footer (note, date printed, "Lab - tagline"). Header and footer space stays free when they are turned off, for pre-printed paper.
    /// </summary>
    public static string Build(ReportData r, ReportOptions? options = null, DateTime? printedAt = null)
    {
        options ??= new();
        string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        var b = r.Branding;
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"><title>Report ").Append(E(r.PatientName)).Append("</title><style>")
          .Append("@page{size:A4;margin:0}*{box-sizing:border-box}body{font:10pt Helvetica,Arial,sans-serif;color:#000;margin:0}")
          .Append(".page{position:relative;width:210mm;min-height:297mm;padding:0 14mm 48mm}")
          .Append(".band{margin:0 -14mm;height:45mm;background:#1e3a8a;color:#fff;display:flex;align-items:center;padding:0 14mm;position:relative;text-align:center}")
          .Append(".band img{position:absolute;left:14mm;top:7.5mm;width:30mm;height:30mm;object-fit:contain}.band .c{flex:1}.band h1{margin:0 0 3mm;font-size:22pt}.band div{font-size:9pt;line-height:1.55}")
          .Append("h2{font-size:12pt;margin:0;padding-bottom:2mm;border-bottom:.5mm solid #1e3a8a}.info{display:grid;grid-template-columns:1fr 1fr;gap:2mm 8mm;margin:4mm 0 6mm}.info b{display:inline-block;min-width:34mm}")
          .Append("table{width:100%;border-collapse:collapse;margin-top:4mm}th{background:#1e3a8a;color:#fff;font-size:10pt;padding:2.2mm 2mm;text-align:center}th:first-child,td:first-child{text-align:left}")
          .Append("td{font-size:9pt;padding:2mm;text-align:center}tr:nth-child(even) td{background:#f0f5ff}.abn{color:#dc2626;font-weight:700}.ok{color:#10b981;font-weight:700}")
          .Append(".warn{margin:2mm 0;padding:1.5mm 3mm;border:1px solid #b36b00;color:#b36b00;font-size:9pt}")
          .Append(".foot{position:fixed;left:14mm;right:14mm;bottom:12mm;height:32mm;font-size:8pt;color:#646464}.foot hr{border:0;border-top:1px solid #c8c8c8;margin:3mm 0}.foot .n{text-align:center;color:#1e3a8a}")
          .Append("</style></head><body><div class=\"page\">");

        if (options.IncludeWatermark && b?.LogoDataUri is { Length: > 0 } mark)
            sb.Append("<img src=\"").Append(E(mark)).Append("\" alt=\"\" style=\"position:fixed;top:50%;left:50%;width:140mm;height:140mm;object-fit:contain;transform:translate(-50%,-50%);opacity:.07;z-index:-1\">");

        if (options.IncludeHeader)
        {
            sb.Append("<div class=\"band\">");
            if (b?.LogoDataUri is { Length: > 0 } logo) sb.Append("<img src=\"").Append(E(logo)).Append("\" alt=\"\">");
            sb.Append("<div class=\"c\"><h1>").Append(E(b?.Name ?? r.LabName)).Append("</h1>");
            if (b is not null)
            {
                if (b.AddressLines.Count > 0) sb.Append("<div>").Append(E(string.Join(", ", b.AddressLines))).Append("</div>");
                if (!string.IsNullOrWhiteSpace(b.Phone)) sb.Append("<div>Phone: ").Append(E(b.Phone)).Append("</div>");
                var email = string.IsNullOrWhiteSpace(b.Email) ? null : "Email: " + b.Email;
                var site = string.IsNullOrWhiteSpace(b.Website) ? null : "Website: " + b.Website;
                var line = string.Join(" | ", new[] { email, site }.Where(x => x is not null));
                if (line.Length > 0) sb.Append("<div>").Append(E(line)).Append("</div>");
            }
            else sb.Append("<div>Laboratory report</div>");
            sb.Append("</div></div>");
        }
        else sb.Append("<div style=\"height:55mm\"></div>"); // the header area stays empty for pre-printed paper
        if (options.IncludeHeader) sb.Append("<div style=\"height:10mm\"></div>");

        sb.Append("<h2>PATIENT INFORMATION</h2><div class=\"info\">")
          .Append("<div><b>Name:</b>").Append(E(r.PatientName)).Append("</div><div><b>Gender:</b>").Append(E(string.IsNullOrWhiteSpace(r.Gender) ? "N/A" : r.Gender)).Append("</div>")
          .Append("<div><b>Patient ID:</b>").Append(E(r.PatientCode)).Append("</div><div><b>Age:</b>").Append(E(string.IsNullOrWhiteSpace(r.Age) ? "N/A" : r.Age)).Append("</div>")
          .Append("<div><b>Phone:</b>").Append(E(r.Phone)).Append("</div><div><b>Report Date:</b>").Append(E(Dates.FromIso(r.ReportDate))).Append("</div>")
          .Append("<div><b>Sample Collection Date:</b>").Append(E(Dates.FromIso(r.ReportDate))).Append("</div></div>");
        if (!string.IsNullOrWhiteSpace(r.HeaderText)) sb.Append("<div style=\"white-space:pre-line;font-size:9pt;margin:0 0 4mm\">").Append(E(r.HeaderText)).Append("</div>");
        if (r.Provisional) sb.Append("<div class=\"warn\">Preliminary: some of these results have not been confirmed by the server yet.</div>");

        sb.Append("<h2>TEST RESULTS</h2>");
        var lines = r.Sections.SelectMany(s => s.Lines.Select(l => (Name: s.IsPanel ? s.TestName + " - " + l.Test : l.Test, Line: l))).ToList();
        if (r.ListFormat)
        {
            sb.Append("<table><tr><th style=\"width:60mm\">Test</th><th style=\"text-align:left\">Result</th></tr>");
            foreach (var (name, l) in lines)
            {
                var extras = new List<string>();
                if (r.ShowReference) extras.Add("Range: " + (string.IsNullOrWhiteSpace(l.Reference) ? "-" : l.Reference));
                if (r.ShowFlag) extras.Add(l.Abnormal ? "ABN" : "OK");
                var value = $"{l.Result} {l.Unit}".Trim() + (extras.Count > 0 ? $" ({string.Join(" • ", extras)})" : "");
                sb.Append("<tr><td>").Append(E(name)).Append("</td><td style=\"text-align:left\">").Append(E(value)).Append("</td></tr>");
            }
            sb.Append("</table>");
        }
        else
        {
            sb.Append("<table><tr><th style=\"width:40%\">Test Name</th><th>Result</th><th>Unit</th>").Append(r.ShowReference ? "<th>Normal Range</th>" : "").Append(r.ShowFlag ? "<th>Status</th>" : "").Append("</tr>");
            foreach (var (name, l) in lines)
                sb.Append("<tr><td>").Append(E(name)).Append("</td><td>").Append(E(l.Result)).Append("</td><td>").Append(E(string.IsNullOrWhiteSpace(l.Unit) ? "-" : l.Unit)).Append("</td>")
                  .Append(r.ShowReference ? "<td>" + E(string.IsNullOrWhiteSpace(l.Reference) ? "-" : l.Reference) + "</td>" : "")
                  .Append(r.ShowFlag ? (l.Abnormal ? "<td class=\"abn\">&#9650; ABN</td>" : "<td class=\"ok\">&#10003;</td>") : "").Append("</tr>");
            sb.Append("</table>");
        }

        if (!string.IsNullOrWhiteSpace(r.EnteredBy)) sb.Append("<div style=\"margin-top:6mm;font-size:9pt\"><b>Results Entered By:</b> ").Append(E(r.EnteredBy)).Append("</div>");
        if (options.IncludeFooter && !string.IsNullOrWhiteSpace(r.FooterText)) sb.Append("<div style=\"white-space:pre-line;margin-top:5mm;font-size:9pt;color:#3c3c3c\">").Append(E(r.FooterText)).Append("</div>");

        if (options.IncludeFooter)
        {
            sb.Append("<div class=\"foot\"><div>").Append(E(b?.ReportFooterNote ?? "This is a computer generated report.")).Append("</div><div>Generated on: ")
              .Append(E((printedAt ?? DateTime.Now).ToString("dd/MM/yyyy HH:mm"))).Append("</div><hr><div class=\"n\">").Append(E(b?.Name ?? r.LabName))
              .Append(" - ").Append(E(b?.ReportTagline ?? Branding.DefaultReportTagline)).Append("</div></div>");
        }
        sb.Append("</div></body></html>");
        return sb.ToString();
    }
}
