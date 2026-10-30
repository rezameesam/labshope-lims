using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class PatientRulesTests : IDisposable
{
    private static readonly DateOnly Today = new(2026, 10, 29);
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;

    public PatientRulesTests() => _store = new LocalStore(_path);

    [Theory]
    [InlineData("", "name")]
    [InlineData("   ", "name")]
    public void ANameIsRequired(string name, string message) =>
        Assert.Contains(message, Assert.Throws<ArgumentException>(() => PatientRules.CleanName(name)).Message);

    [Fact]
    public void ANameIsTrimmedAndLimited()
    {
        Assert.Equal("Asha Rao", PatientRules.CleanName("  Asha Rao "));
        Assert.Contains("too long", Assert.Throws<ArgumentException>(() => PatientRules.CleanName(new string('A', 121))).Message);
    }

    [Theory]
    [InlineData("1985-03-07", "1985-03-07")]
    [InlineData(" 2024-02-29 ", "2024-02-29")] // a real leap day
    [InlineData("2026-10-29", "2026-10-29")] // born today is fine
    [InlineData("", null)]
    [InlineData(null, null)]
    public void ABirthDateIsKeptAsYearMonthDay(string? text, string? expected) =>
        Assert.Equal(expected, PatientRules.CleanBirthDate(text, Today));

    [Theory]
    [InlineData("2999-01-01", "future")]
    [InlineData("2026-10-30", "future")]
    [InlineData("1850-01-01", "1900")]
    [InlineData("07/03/1985", "calendar date")]
    [InlineData("2025-02-29", "calendar date")] // not a real day
    public void ImpossibleBirthDatesAreRefused(string text, string message) =>
        Assert.Contains(message, Assert.Throws<ArgumentException>(() => PatientRules.CleanBirthDate(text, Today)).Message);

    [Fact]
    public void RegisteringAVisitRefusesABlankNameAFutureBirthDateAndANegativePrice()
    {
        var visits = new VisitService(_store);
        RegisterVisitInput Input(string name, string? dob, decimal price) =>
            new("org-1", "lab-1", "2026-10-29", [new VisitTest("CBC", price)], NewPatient: new NewPatient(name, "9876543210", DateOfBirth: dob));

        Assert.Throws<ArgumentException>(() => visits.Register(Input("  ", null, 100)));
        Assert.Throws<ArgumentException>(() => visits.Register(Input("Asha", "2999-01-01", 100)));
        Assert.Throws<ArgumentException>(() => visits.Register(Input("Asha", null, -50)));
        Assert.Empty(_store.SearchPatients("")); // nothing half-created
    }

    [Fact]
    public void ADiscountIsTakenOffTheBillSentWithTheVisitAndShownOnTheReceipt()
    {
        var visits = new VisitService(_store);
        var visit = visits.Register(new RegisterVisitInput("org-1", "lab-1", "2026-10-29", [new VisitTest("CBC", 100), new VisitTest("TSH", 200)],
            NewPatient: new NewPatient("Asha Rao", "9876543210"), Discount: 50m, Payment: new InitialPayment(250m)));

        Assert.Equal(250m, visit.Total); // what the patient pays
        var bill = _store.GetInvoice(visit.VisitId)!;
        Assert.Equal((250m, 50m, 250m, "paid"), (bill.TotalAmount, bill.Discount, bill.PaidAmount, bill.PaymentStatus));
        Assert.Equal(50m, visit.Receipt!.Discount);
        Assert.Equal(0m, visit.Receipt.Balance);
        Assert.Equal(50m, System.Text.Json.JsonDocument.Parse(_store.GetVisit(visit.VisitId)!.PayloadJson).RootElement.GetProperty("discount").GetDecimal());
    }

    [Theory]
    [InlineData(9999, 300)]   // never more than the bill
    [InlineData(-20, 0)]      // never negative
    [InlineData(10.005, 10.01)] // whole paise
    public void TheDiscountIsKeptWithinTheBill(double typed, double expected) =>
        Assert.Equal((decimal)expected, VisitService.ClampDiscount((decimal)typed, 300m));

    [Fact]
    public void WithoutADiscountNothingChanges()
    {
        var visit = new VisitService(_store).Register(new RegisterVisitInput("org-1", "lab-1", "2026-10-29", [new VisitTest("CBC", 100)], NewPatient: new NewPatient("Asha Rao", "9876543210")));
        Assert.Equal(100m, visit.Total);
        Assert.False(System.Text.Json.JsonDocument.Parse(_store.GetVisit(visit.VisitId)!.PayloadJson).RootElement.TryGetProperty("discount", out _));
    }

    [Theory]
    [InlineData("100.005", "100.01")]
    [InlineData("0.001", "0")]
    [InlineData("250.5", "250.5")]
    public void PaymentsAreWholePaise(string typed, string expected) =>
        Assert.Equal(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), PatientRules.Paise(decimal.Parse(typed, System.Globalization.CultureInfo.InvariantCulture)));

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
