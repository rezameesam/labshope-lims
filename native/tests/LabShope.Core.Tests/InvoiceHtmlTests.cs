using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class InvoiceHtmlTests
{
    private static readonly Branding Brand = Branding.FromContext("""{"organization":{"display_name":"Sunrise <Diagnostics>","primary_phone":"+911","primary_email":"hi@sunrise.example"},"primary_lab":{"address":"12 Park Road","city":"Pune"},"settings":{}}""", "x")!;
    private static readonly Patient Asha = new("p1", "IRM-0007", "Asha Rao", "+919876543210", null, null);

    private static BillDetails Details(params BillItem[] items) =>
        new(items, [new BillPayment("pay1", 300m, "upi", "2026-10-30T10:00:00Z", "UTR123", null, null)], [], null, false);

    [Fact]
    public void ListsTheLabThePatientEveryTestTheDiscountThePaymentsAndTheBalance()
    {
        var bill = new BillRow("i1", "INV-000042", "p1", "Asha Rao", "IRM-0007", 700m, 300m, "partial", "2026-10-30T09:00:00Z", 100m);
        var html = InvoiceHtml.Build(bill, Asha, Details(new BillItem("a", "CBC", 350m, 1, 350m), new BillItem("b", "Liver Function Test", 450m, 1, 450m)), Brand);

        Assert.Contains("INVOICE", html);
        Assert.Contains("INV-000042", html);
        Assert.Contains("Sunrise &lt;Diagnostics&gt;", html); // names are escaped
        Assert.Contains("12 Park Road", html);
        Assert.Contains("Asha Rao", html);
        Assert.Contains("IRM-0007", html);
        Assert.Contains("CBC", html);
        Assert.Contains("Liver Function Test", html);
        Assert.Contains("₹800.00", html);           // subtotal
        Assert.Contains("-₹100.00", html);          // discount
        Assert.Contains("₹700.00", html);           // total
        Assert.Contains("PART PAID", html);
        Assert.Contains("UTR123", html);
        Assert.Contains("₹400.00", html);           // balance due
    }

    [Fact]
    public void PaidBillsSayPaidAndUnpaidSayUnpaidAndOmitTheDiscountLineWhenThereIsNone()
    {
        var paid = new BillRow("i1", "INV-1", "p1", "Asha Rao", "IRM-0007", 350m, 350m, "paid", "2026-10-30T09:00:00Z");
        var html = InvoiceHtml.Build(paid, Asha, Details(new BillItem("a", "CBC", 350m, 1, 350m)), Brand);
        Assert.Contains(">PAID<", html);
        Assert.DoesNotContain("Discount", html);

        var unpaid = new BillRow("i2", "INV-2", "p1", "Asha Rao", "IRM-0007", 350m, 0m, "pending", "2026-10-30T09:00:00Z");
        Assert.Contains(">UNPAID<", InvoiceHtml.Build(unpaid, Asha, new BillDetails([new BillItem("a", "CBC", 350m, 1, 350m)], [], [], null, false), Brand));
    }

    [Fact]
    public void ABillWithoutItemLinesStillPrintsItsTotals()
    {
        var bill = new BillRow("i1", "INV-1", "p1", "Asha Rao", "IRM-0007", 500m, 0m, "pending", "2026-10-30T09:00:00Z");
        var html = InvoiceHtml.Build(bill, null, new BillDetails([], [], [], null, false), Brand);
        Assert.Contains("No item lines were found", html);
        Assert.Contains("₹500.00", html);
        Assert.Contains("Asha Rao", html); // the patient name comes from the bill when the patient isn't on this PC
    }
}
