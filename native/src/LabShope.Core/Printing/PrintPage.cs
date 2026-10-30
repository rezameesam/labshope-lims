namespace LabShope.Core.Printing;

/// <summary>
/// Makes a printable HTML page ask for printing as soon as it has loaded, so "Print" in the app really opens the print dialog instead of just
/// showing the page. A small bar with a Print button is added for the rare browser that blocks the automatic request; it does not print.
/// </summary>
public static class PrintPage
{
    private const string Marker = "<!--labshope-print-->";

    private const string Bar =
        Marker +
        "<style>@media print{.labshope-print-bar{display:none !important}}" +
        ".labshope-print-bar{position:sticky;top:0;z-index:99;display:flex;gap:12px;align-items:center;justify-content:center;padding:8px 12px;" +
        "background:#EAF4FB;border-bottom:1px solid #B9D6EA;font:14px system-ui,sans-serif;color:#0B3552}" +
        ".labshope-print-bar button{padding:6px 16px;border:0;border-radius:6px;background:#0B6BA8;color:#fff;font:inherit;cursor:pointer}</style>" +
        "<div class=\"labshope-print-bar\"><span>If the print window did not open:</span><button onclick=\"window.print()\">Print</button></div>" +
        "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>";

    public static string WithAutoPrint(string html)
    {
        if (string.IsNullOrEmpty(html)) return html;
        if (html.Contains(Marker, StringComparison.Ordinal)) return html; // already prepared

        var body = html.IndexOf("<body", StringComparison.OrdinalIgnoreCase);
        if (body >= 0)
        {
            var end = html.IndexOf('>', body);
            if (end >= 0) return html.Insert(end + 1, Bar);
        }
        return Bar + html;
    }
}
