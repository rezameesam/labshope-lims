using LabShope.Core.Finance;

namespace LabShope.Core.Tests;

public class StatementsTests
{
    private static AccountBalance A(string code, string name, string type, decimal debit, decimal credit) => new(code, code, name, type, debit, credit);

    private static readonly AccountBalance[] Books =
    [
        A("1001", "Cash", "asset", 1700, 300),            // 1,400
        A("1100", "Receivables", "asset", 400, 0),        // 400
        A("2001", "Payables", "liability", 0, 500),       // 500
        A("3001", "Owner capital", "equity", 0, 600),     // 600
        A("4001", "Test revenue", "revenue", 0, 1000),    // 1,000
        A("5001", "Reagents", "expense", 300, 0),         // 300
        A("5002", "Rent", "expense", 0, 0),               // zero: left out
    ];

    [Fact]
    public void ProfitAndLossIsRevenueMinusExpensesWithTheMargin()
    {
        var s = Statements.ProfitAndLoss(Books, new DateOnly(2026, 4, 1), new DateOnly(2026, 10, 31));

        Assert.Equal((1000m, 300m), (s.Left, s.Right));
        Assert.Contains(s.Lines, l => l is { Label: "Net profit", Amount: 700m });
        Assert.DoesNotContain(s.Lines, l => l.Label == "Rent");
        Assert.Equal("Profit 700.00  ·  margin 70%", s.Summary);
        Assert.True(s.Good);
        Assert.Equal("Profit & Loss, 1 Apr 2026 to 31 Oct 2026", s.Title);
    }

    [Fact]
    public void ALossIsLabelledAsOne()
    {
        var s = Statements.ProfitAndLoss([A("4001", "Revenue", "revenue", 0, 100), A("5001", "Rent", "expense", 250, 0)], new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 31));
        Assert.Contains(s.Lines, l => l is { Label: "Net loss", Amount: -150m });
        Assert.False(s.Good);
    }

    [Fact]
    public void TheBalanceSheetCountsTheProfitSoAssetsEqualLiabilitiesPlusEquity()
    {
        var s = Statements.BalanceSheet(Books, new DateOnly(2026, 10, 31));

        Assert.Equal(1800m, s.Left);                                         // 1,400 + 400
        Assert.Equal(1800m, s.Right);                                        // 500 liabilities + 600 capital + 700 profit
        Assert.True(s.Good);
        Assert.Contains(s.Lines, l => l is { Label: "Total assets", Amount: 1800m });
        Assert.Contains(s.Lines, l => l is { Label: "Total equity", Amount: 1300m });
        Assert.StartsWith("Balanced", s.Summary);
    }

    [Fact]
    public void ABookThatDoesNotTallyIsFlagged()
    {
        var s = Statements.BalanceSheet([A("1001", "Cash", "asset", 100, 0), A("2001", "Payables", "liability", 0, 40)], new DateOnly(2026, 10, 31));
        Assert.False(s.Good);
        Assert.Equal("Out of balance by 60.00", s.Summary);
    }

    [Fact]
    public void ThePrintedPageCarriesTheLabNameAndTheFigures()
    {
        var s = Statements.ProfitAndLoss(Books, new DateOnly(2026, 4, 1), new DateOnly(2026, 10, 31));
        var html = Statements.ToHtml("Sunrise & Co", s, new DateTime(2026, 10, 31, 9, 5, 0));
        Assert.Contains("Sunrise &amp; Co", html);
        Assert.Contains("Test revenue", html);
        Assert.Contains("1,000.00", html);
        Assert.Contains("Generated 31/10/2026 09:05", html);
    }
}
