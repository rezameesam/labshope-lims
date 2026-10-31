using System.Net;
using System.Text;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

public sealed record ReportLine(string Test, string Result, string Unit, string Reference, bool Abnormal);

public sealed record ReportSection(string TestName, IReadOnlyList<ReportLine> Lines, bool IsPanel);

public sealed record ReportData(
    string LabName, string PatientName, string PatientCode, string? Gender, string? Age, string Phone,
    string ReportDate, IReadOnlyList<ReportSection> Sections, bool Provisional = false, Branding? Branding = null,
    string? HeaderText = null, string? FooterText = null, bool ShowReference = true, bool ShowFlag = true);

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
            HeaderText: header, FooterText: footer, ShowReference: template?.IncludeNormalRange ?? true, ShowFlag: template?.IncludeAbnormalFlag ?? true);
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
    public static string Build(ReportData r, ReportOptions? options = null)
    {
        options ??= new();
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
        if (options.IncludeWatermark && b?.LogoDataUri is { Length: > 0 } mark)
            sb.Append("<img src=\"").Append(E(mark)).Append("\" alt=\"\" style=\"position:fixed;top:50%;left:50%;width:120mm;height:120mm;object-fit:contain;transform:translate(-50%,-50%);opacity:.07;z-index:-1\">");
        if (options.IncludeHeader) {
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
        sb.Append("</div></div><div style=\"text-align:right\">Report date<br><b>").Append(E(Dates.FromIso(r.ReportDate))).Append("</b></div></div>");
        } else sb.Append("<div style=\"height:34mm\"></div>"); // leave the printed letterhead's space free
        sb.Append("<div class=\"meta\"><div>Patient: <b>").Append(E(r.PatientName)).Append("</b></div><div>Patient ID: <b>").Append(E(r.PatientCode)).Append("</b></div>")
          .Append("<div>Age / sex: ").Append(E(string.Join(" / ", new[] { r.Age, r.Gender }.Where(x => !string.IsNullOrWhiteSpace(x))))).Append("</div><div>Phone: ").Append(E(r.Phone)).Append("</div></div>");
        if (!string.IsNullOrWhiteSpace(r.HeaderText)) sb.Append("<div style=\"white-space:pre-line;margin:6px 0 4px\">").Append(E(r.HeaderText)).Append("</div>");
        if (r.Provisional) sb.Append("<div class=\"warn\">Preliminary: some of these results have not been confirmed by the server yet.</div>");

        foreach (var s in r.Sections)
        {
            sb.Append("<h2>").Append(E(s.TestName)).Append("</h2><table><tr><th>Test</th><th>Result</th><th>Unit</th>").Append(r.ShowReference ? "<th>Reference range</th>" : "").Append("</tr>");
            foreach (var l in s.Lines)
                sb.Append("<tr").Append(r.ShowFlag && l.Abnormal ? " class=\"abn\"" : "").Append("><td>").Append(E(l.Test)).Append("</td><td class=\"v\">").Append(E(l.Result))
                  .Append("</td><td>").Append(E(l.Unit)).Append("</td>").Append(r.ShowReference ? "<td>" + E(l.Reference) + "</td>" : "").Append("</tr>");
            sb.Append("</table>");
        }
        if (options.IncludeFooter)
        {
            if (!string.IsNullOrWhiteSpace(r.FooterText)) sb.Append("<div style=\"white-space:pre-line;margin-top:18px;font-size:12px\">").Append(E(r.FooterText)).Append("</div>");
            sb.Append("<div class=\"note\">").Append(r.ShowFlag ? "* Outside the reference range. " : "").Append(E(r.Branding?.ReportFooterNote ?? "This is a computer generated report.")).Append("</div>");
        }
        else if (r.ShowFlag) sb.Append("<div class=\"note\">* Outside the reference range.</div>");
        sb.Append("</body></html>");
        return sb.ToString();
    }
}
