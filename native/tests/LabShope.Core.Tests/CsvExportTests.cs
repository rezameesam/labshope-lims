using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class CsvExportTests
{
    [Fact]
    public void QuotesCommasQuotesAndNewLinesAndDefusesFormulas()
    {
        Assert.Equal("plain", CsvExport.Cell("plain"));
        Assert.Equal("\"Rao, Asha\"", CsvExport.Cell("Rao, Asha"));
        Assert.Equal("\"say \"\"hi\"\"\"", CsvExport.Cell("say \"hi\""));
        Assert.Equal("\"a\nb\"", CsvExport.Cell("a\nb"));
        Assert.Equal("'=SUM(A1)", CsvExport.Cell("=SUM(A1)"));
        Assert.Equal("'@cmd", CsvExport.Cell("@cmd"));
        Assert.Equal("-5", CsvExport.Cell("-5")); // a real number stays a number
        Assert.Equal("", CsvExport.Cell(null));
    }

    [Fact]
    public void BillsExportOneLinePerBillWithTheDueAmount()
    {
        var csv = CsvExport.Bills([new BillRow("i1", "INV-1", "p1", "Asha Rao", "IRM-7", 700m, 200m, "partial", "2026-10-30T10:00:00Z", 100m)]);
        var lines = csv.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal("Invoice,Date,Patient,Patient ID,Amount,Discount,Paid,Due,Status", lines[0]);
        Assert.EndsWith(",Asha Rao,IRM-7,700,100,200,500,partial", lines[1]);
    }

    [Fact]
    public void PatientsExportAndTheFileStartsWithAByteOrderMark()
    {
        var csv = CsvExport.Patients([new Patient("p1", "IRM-7", "Asha Rao", "+919876543210", "female", "1990-05-01", Email: "a@b.in")]);
        Assert.Contains("IRM-7,Asha Rao,+919876543210,a@b.in,female,", csv);
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, CsvExport.ToFileBytes(csv).Take(3).ToArray());
    }
}
