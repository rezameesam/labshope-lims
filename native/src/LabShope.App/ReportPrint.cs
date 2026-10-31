using Avalonia.Controls;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Prints a patient's report for a date: asks what to include (header, footer, watermark), remembers it, then opens the print dialog.</summary>
public static class ReportPrint
{
    /// <returns>An empty string when printing started or was cancelled, otherwise why nothing was printed.</returns>
    public static async Task<string> RunAsync(Window owner, AppSession session, string patientId, string date)
    {
        var report = ReportBuilder.For(session.Store, session.Workspace.OrganizationName, patientId, date,
            branding: session.Store.GetBranding(session.Workspace.OrganizationName), organizationId: session.Workspace.OrganizationId, labId: session.Workspace.LabId);
        if (report is null) return "No completed results for this patient on that date yet.";

        var dialog = new ReportOptionsDialog(ReportOptions.Load(session.Store));
        await dialog.ShowDialog(owner);
        if (dialog.Chosen is not { } options) return "";
        options.Save(session.Store);
        ReceiptPrinter.OpenHtml($"report-{report.PatientCode}-{report.ReportDate}", ReportHtml.Build(report, options));
        return "";
    }
}
