using System.Net;
using LabShope.Core.Data;

namespace LabShope.Core.Notify;

/// <summary>Colours and contact details for the email layout (the website's notification branding).</summary>
public sealed record EmailBrand(
    string Name, string Tagline, string Address, string Phone, string Email, string Website, string? LogoUrl,
    string Primary = "#1E3A8A", string Accent = "#3B82F6", string Background = "#F5F8FF", string Text = "#0F172A", string Muted = "#64748B", string Border = "#E2E8F0")
{
    public static EmailBrand From(Branding b, string portalHost) => new(
        b.Name, b.Tagline ?? "Accurate. Reliable. Timely.", b.AddressLines.Count > 0 ? string.Join(", ", b.AddressLines) : "Laboratory address",
        b.Phone ?? "+91-0000000000", b.Email ?? "support@example.com", b.Website ?? $"https://{portalHost}", b.LogoUrl);
}

/// <summary>The default wording of the website's notifications (labs can override it in their settings).</summary>
public static class NotificationTemplates
{
    public const string AllTestsReadySubject = "All Test Results Ready ({test_count})";
    public const string AllTestsReadyMessage = "Dear {patient_name},\n\nAll your test results are now ready. Tests: {test_list}.\n\nPlease log in to your patient portal to view and download your report:\n{portal_url}\n\nThank you!";

    /// <summary>Replaces {name} markers, exactly as the website does.</summary>
    public static string Render(string template, IReadOnlyDictionary<string, string> context) =>
        context.Aggregate(template, (text, kv) => text.Replace("{" + kv.Key + "}", kv.Value ?? ""));
}

/// <summary>The email the website sends (same layout, "general" accent), ported so patients get the same message from either app.</summary>
public static class EmailTemplate
{
    private static string Esc(string v) => WebUtility.HtmlEncode(v).Replace("'", "&#39;");

    public static string Html(string title, string message, EmailBrand b, int year)
    {
        var accent = b.Primary; // "general" notifications use the primary colour
        var formatted = Esc(message).Replace("\n", "<br/>");
        var preheader = Esc(title.Length > 80 ? title[..80] : title);
        var logo = string.IsNullOrWhiteSpace(b.LogoUrl) ? ""
            : $"<img src=\"{b.LogoUrl}\" alt=\"{b.Name}\" width=\"32\" height=\"32\" style=\"display:block; border-radius:8px; background:#ffffff; padding:3px;\">";

        return $"""
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>{title}</title>
            </head>
            <body style="margin:0; padding:0; background:{b.Background}; font-family: 'Segoe UI', Arial, sans-serif; color:{b.Text};">
              <div style="display:none; max-height:0; overflow:hidden; opacity:0;">{preheader}</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{b.Background}; padding: 32px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border:1px solid {b.Border};">
                      <tr>
                        <td style="padding: 22px 28px; background:{b.Primary}; color:#ffffff;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="vertical-align:middle; width:56px;">{logo}</td>
                              <td style="vertical-align:middle;">
                                <div style="font-size:18px; font-weight:700; letter-spacing:0.3px;">{b.Name}</div>
                                <div style="font-size:12px; opacity:0.85;">{b.Tagline}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 28px;">
                          <div style="font-size:20px; font-weight:700; margin-bottom: 10px;">{title}</div>
                          <div style="height:4px; width:64px; background:{accent}; border-radius:999px; margin-bottom:18px;"></div>
                          <div style="font-size:15px; line-height:1.7; color:{b.Text};">{formatted}</div>
                          <div style="margin-top:24px; padding:14px 16px; border-left:4px solid {accent}; background:#F8FAFC; border-radius:10px; font-size:13px; color:{b.Muted};">
                            For assistance, contact us at {b.Phone} or {b.Email}.<br/>
                            Visit: <a href="{b.Website}" style="color:{accent}; text-decoration:none;">{b.Website}</a>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 18px 28px; border-top:1px solid {b.Border}; background:#ffffff;">
                          <div style="font-size:12px; color:{b.Muted}; text-align:center;">
                            {b.Address}<br/>
                            <a href="{b.Website}" style="color:{b.Muted}; text-decoration:none;">{b.Website}</a><br/>
                            This is an automated message. Please do not reply.
                          </div>
                        </td>
                      </tr>
                    </table>
                    <div style="font-size:11px; color:{b.Muted}; margin-top:16px; text-align:center;">
                      © {year} {b.Name}. All rights reserved.
                    </div>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """;
    }

    public static string Text(string title, string message, EmailBrand b)
    {
        var hasWebsite = message.Contains(b.Website, StringComparison.OrdinalIgnoreCase);
        return string.Join("\n", new[]
        {
            title, "", message, hasWebsite ? "" : $"Visit: {b.Website}", "", b.Name, b.Address,
            $"Phone: {b.Phone}", $"Email: {b.Email}", $"Website: {b.Website}", "", "This is an automated message. Please do not reply.",
        }.Where(line => line != ""));
    }
}
