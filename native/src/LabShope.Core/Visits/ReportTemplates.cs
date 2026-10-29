using System.Text.RegularExpressions;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>Chooses and fills in the lab's report template, the same way the website does.</summary>
public static class ReportTemplates
{
    /// <summary>
    /// The template for a report: the lab's own templates before shared ones; for a single test the template made for that test, then for its
    /// category; for several tests of one category that category's template; otherwise the default template (or none).
    /// </summary>
    public static ReportTemplate? Resolve(Catalog catalog, string organizationId, IReadOnlyList<string> testNames)
    {
        var templates = catalog.TemplateList.OrderBy(t => t.OrganizationId == organizationId ? 0 : 1).ToList();
        if (templates.Count == 0) return null;

        var tests = testNames.Select(n => catalog.Tests.FirstOrDefault(t => string.Equals(t.Name, n, StringComparison.OrdinalIgnoreCase))).Where(t => t is not null).Select(t => t!).ToList();
        var testIds = tests.Select(t => t.Id).Distinct().ToList();
        var categories = tests.Select(t => catalog.CategoryList.FirstOrDefault(c => c.Id == t.CategoryId)?.Name).Where(n => !string.IsNullOrEmpty(n)).Distinct().ToList();

        if (testNames.Count == 1 && testIds.Count == 1 && templates.FirstOrDefault(t => t.TestId == testIds[0]) is { } byTest) return byTest;
        if (testNames.Count == 1 && categories.Count == 1 && templates.FirstOrDefault(t => t.TestCategory == categories[0]) is { } single) return single;
        if (categories.Count == 1 && templates.FirstOrDefault(t => t.TestCategory == categories[0]) is { } byCategory) return byCategory;
        return templates.FirstOrDefault(t => t.IsDefault);
    }

    /// <summary>Replaces {markers} then turns the template's simple HTML into plain text lines (as the website's printed reports do).</summary>
    public static string RenderText(string? template, IReadOnlyDictionary<string, string> context)
    {
        var text = context.Aggregate(template ?? "", (t, kv) => t.Replace("{" + kv.Key + "}", kv.Value ?? ""));
        text = Regex.Replace(text, @"<br\s*/?>", "\n", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"</p>", "\n", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"<li>", "• ", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"</li>", "\n", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"&nbsp;", " ", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"<[^>]*>", "");
        text = Regex.Replace(text, @"\n{3,}", "\n\n");
        return System.Net.WebUtility.HtmlDecode(text).Trim();
    }
}
