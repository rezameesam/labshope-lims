using LabShope.Core.Finance;

namespace LabShope.Core.Tests;

public class LedgerTests
{
    private static readonly AccountInfo Cash = new("c", "1001", "Cash", "asset", null, true);
    private static readonly AccountInfo Revenue = new("r", "4001", "Test Revenue", "revenue", null, true);

    [Fact]
    public void AnAssetGrowsWithDebitsAndTheRunningBalanceFollowsDateOrder()
    {
        var l = Ledgers.Build(Cash, [("2026-10-05", "E2", "Rent", null, 0m, 200m), ("2026-10-01", "E1", "Payment", "INV1", 750m, 0m)]);

        Assert.Equal(["E1", "E2"], l.Lines.Select(x => x.EntryNumber));
        Assert.Equal([750m, 550m], l.Lines.Select(x => x.Balance));
        Assert.Equal((750m, 200m, 550m), (l.TotalDebit, l.TotalCredit, l.Closing));
    }

    [Fact]
    public void RevenueGrowsWithCreditsAndAnEmptyLedgerIsZero()
    {
        Assert.Equal(750m, Ledgers.Build(Revenue, [("2026-10-01", "E1", "Invoice", null, 0m, 750m)]).Closing);
        Assert.Equal(0m, Ledgers.Build(Revenue, []).Closing);
        Assert.True(Ledgers.DebitNormal("expense"));
        Assert.False(Ledgers.DebitNormal("liability"));
    }

    [Fact]
    public void ThePrintedLedgerShowsTheAccountAndEscapesText()
    {
        var l = Ledgers.Build(Cash, [("2026-10-01", "E1", "A & B", null, 750m, 0m)]);
        var html = Ledgers.ToHtml("Sunrise", l, new DateOnly(2026, 4, 1), new DateOnly(2026, 10, 31), new DateTime(2026, 10, 31));
        Assert.Contains("1001 - Cash", html);
        Assert.Contains("A &amp; B", html);
        Assert.Contains("750.00", html);
    }
}
