using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

public partial class PatientHistoryDialog : Window
{
    public sealed record BillLine(string Number, string Date, string Total, string Paid, string Status);
    public sealed record TestLine(string Date, string Test, string Status, string Result);

    public PatientHistoryDialog() => throw new InvalidOperationException("Use the constructor with a patient.");

    public PatientHistoryDialog(LocalStore store, Patient patient)
    {
        InitializeComponent();
        var history = PatientAdmin.HistoryOf(store, patient.Id);
        Heading.Text = $"{patient.FullName}  ·  {patient.PatientCode}";
        SummaryText.Text = $"{history.Bills.Count} bill(s), {history.Tests.Count} test(s)  ·  billed ₹{history.Billed:N2}  ·  still to pay ₹{history.Owed:N2}";
        BillGrid.ItemsSource = history.Bills.Select(b => new BillLine(b.InvoiceNumber, Dates.FromMoment(b.CreatedAt), $"₹{b.TotalAmount:N2}", $"₹{b.PaidAmount:N2}", b.PaymentStatus ?? "pending")).ToList();
        TestGrid.ItemsSource = history.Tests.Select(t => new TestLine(Dates.FromIso(t.TestDate), t.TestName, t.Status.Replace('_', ' '),
            t.ResultItemsJson is { Length: > 2 } j ? $"{ResultItem.ParseAll(j).Count(i => i.Value.Trim() != "")} values"
            : t.ResultValue is { } v ? $"{ResultFormat.Number(v)} {t.ResultUnit}".Trim() : t.Result ?? "")).ToList();
    }

    private void OnClose(object? sender, RoutedEventArgs e) => Close();
}
