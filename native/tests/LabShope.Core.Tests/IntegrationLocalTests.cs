using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;
using LabShope.Core;

namespace LabShope.Core.Tests;

/// <summary>
/// End-to-end check against a real local Supabase (real auth, RLS, register_visit). Skipped unless
/// LIMS_IT_URL, LIMS_IT_ANON_KEY, LIMS_IT_EMAIL, LIMS_IT_PASSWORD, LIMS_IT_ORG and LIMS_IT_LAB are set;
/// scripts/test-db.sh sets them up.
/// </summary>
public class IntegrationLocalTests
{
    private static string? Env(string name) => Environment.GetEnvironmentVariable(name);

    [SkippableFact]
    public async Task SignsInRegistersAVisitAndPullsItBack()
    {
        Skip.If(Env("LIMS_IT_URL") is null, "no local database configured");

        var org = Env("LIMS_IT_ORG")!;
        var path = Path.Combine(Path.GetTempPath(), $"labshope-it-{Guid.NewGuid():N}.db");
        using var store = new LocalStore(path);
        var api = new SupabaseApi(new HttpClient(), Env("LIMS_IT_URL")!, Env("LIMS_IT_ANON_KEY")!);

        var (session, signIn) = await api.SignInAsync(Env("LIMS_IT_EMAIL")!, Env("LIMS_IT_PASSWORD")!);
        Assert.True(signIn.Ok, signIn.ErrorMessage);
        Assert.NotNull(session);

        // Register a visit with part payment, exactly as the counter screen does (no network involved yet).
        var phone = $"9{Random.Shared.Next(100000000, 999999999)}";
        var visits = new VisitService(store);
        var visit = visits.Register(new RegisterVisitInput(
            org, Env("LIMS_IT_LAB"), DateTime.UtcNow.ToString("yyyy-MM-dd"),
            [new VisitTest("CBC", 300), new VisitTest("LFT", 450)],
            NewPatient: new NewPatient("Native Integration Patient", phone),
            Payment: new InitialPayment(300m, "upi", "UPI-IT")));
        Assert.Equal(750m, visit.Total);
        Assert.StartsWith("L-", store.GetInvoice(visit.VisitId)!.InvoiceNumber);

        // Send: the visit first, then its payment.
        var engine = new SyncEngine(store, api, org);
        var outcome = await engine.FlushOutboxAsync();
        Assert.Equal(new FlushOutcome(2, 0, null), outcome);
        Assert.Equal((0, 0), store.OutboxCounts());

        // The bill now has the server's number and shows the part payment.
        var bill = store.GetInvoice(visit.VisitId)!;
        Assert.DoesNotContain("L-", bill.InvoiceNumber);
        Assert.Equal(("partial", 300m), (bill.PaymentStatus, bill.PaidAmount));

        // Pull everything back: the server agrees, and a scan of the patient card finds them.
        await engine.PullPatientsAsync();
        await engine.PullInvoicesAsync();
        var fromServer = store.GetInvoice(visit.VisitId)!;
        Assert.Equal(("partial", 300m), (fromServer.PaymentStatus, fromServer.PaidAmount));
        var patientCode = store.SearchPatients("Native Integration").First().PatientCode;
        Assert.IsType<ScanMatch.FoundPatient>(store.ResolveScan(patientCode));

        // Settle the rest, send it, and the bill is paid on the server too.
        new PaymentService(store, org).Record(new PaymentInput(visit.VisitId, 450m, "cash"));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        await engine.PullInvoicesAsync();
        Assert.Equal(("paid", 750m), (store.GetInvoice(visit.VisitId)!.PaymentStatus, store.GetInvoice(visit.VisitId)!.PaidAmount));

        // The test ids the app chose are the ones the server stored, so a result entered on this PC lands on the right row.
        await engine.PullCatalogAsync(force: true);
        await engine.PullPatientTestsAsync();
        var worklist = store.SearchWorklist("", ["pending"]);
        var cbcRows = worklist.Where(r => r.TestName == "CBC" && r.PatientName == "Native Integration Patient").ToList();
        Assert.True(cbcRows.Count == 1, "CBC rows: " + string.Join(" | ", worklist.Select(r => $"{r.TestName}/{r.Id}/{r.PatientName}")));
        var cbc = cbcRows[0];
        var serverRow = await api.SelectAsync("patient_tests", $"select=id,status&id=eq.{cbc.Id}");
        Assert.Equal(1, serverRow.Body!.Value.GetArrayLength());

        var results = new ResultService(store, org, session!.UserId);
        results.Enter(cbc.Id, "12.5", "g/dL");
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());

        var after = await api.SelectAsync("patient_tests", $"select=status,result_value,result_unit,is_abnormal,result_entered_by&id=eq.{cbc.Id}");
        var row = after.Body!.Value[0];
        Assert.Equal("completed", row.GetProperty("status").GetString());
        Assert.Equal(12.5m, row.GetProperty("result_value").GetDecimal());
        Assert.Equal("g/dL", row.GetProperty("result_unit").GetString());
        Assert.Equal(session.UserId, row.GetProperty("result_entered_by").GetString());

        // Entering a result for a test that isn't ours is refused by the server, not silently dropped.
        var stranger = await api.PatchAsync("patient_tests", $"id=eq.{Guid.NewGuid()}&organization_id=eq.{org}", new { status = "completed" });
        Assert.True(stranger.Ok);
        Assert.Equal(0, stranger.Body!.Value.GetArrayLength());

        // Editing a synced patient on this PC updates the real patients row.
        var synced = store.SearchPatients("Native Integration").First();
        new PatientService(store, org).Edit(synced.Id, new PatientEdit("Native Integration Patient Edited", synced.Phone, "female", "1991-02-03"));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var patientRow = (await api.SelectAsync("patients", $"select=full_name,gender,date_of_birth&id=eq.{synced.Id}")).Body!.Value[0];
        Assert.Equal(("Native Integration Patient Edited", "female", "1991-02-03"),
            (patientRow.GetProperty("full_name").GetString(), patientRow.GetProperty("gender").GetString(), patientRow.GetProperty("date_of_birth").GetString()));

        // The lab's branding comes from the same public lookup the website uses.
        Assert.True(await engine.PullBrandingAsync("it-org", "fallback", force: true));
        Assert.Equal("IT Org", store.GetBranding("fallback").Name);

        // A manager can change a test's price and range on the server, and it reaches this PC with the next catalog pull.
        var change = await CatalogAdmin.UpdateTestAsync(api, org, cbc.Id.Length > 0 ? store.GetCatalog().Tests.First(t => t.Name == "CBC").Id : "", new TestEdit("325", "x10^9/L", "4", "11", "", true));
        Assert.True(change.Ok, change.Error);
        await engine.PullCatalogAsync(force: true);
        var cbcTest = store.GetCatalog().Tests.Single(t => t.Name == "CBC");
        Assert.Equal((325m, "x10^9/L", 4m, 11m), (cbcTest.Price, cbcTest.Unit, cbcTest.NormalMin, cbcTest.NormalMax));

        // A booking made on the website reaches this PC; working it here updates the real row.
        await engine.PullBookingsAsync();
        var booking = store.SearchBookings("web booker").Single();
        Assert.Equal("new", booking.Status);
        new BookingService(store, org, session.UserId).MarkConverted(booking.Id, synced.Id);
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var bookingRow = (await api.SelectAsync("booking_requests", $"select=status,patient_id,converted_by&id=eq.{booking.Id}")).Body!.Value[0];
        Assert.Equal(("converted", synced.Id, session.UserId), (bookingRow.GetProperty("status").GetString(), bookingRow.GetProperty("patient_id").GetString(), bookingRow.GetProperty("converted_by").GetString()));

        // The team list comes from the real employees table.
        var team = await TeamService.LoadAsync(api, org);
        Assert.Null(team.Error);
        Assert.Contains(team.Members, m => m.FullName == "IT Admin" && m.IsActive);

        // Inventory: stock used and bought move the real stock level and are logged.
        var stock = await InventoryService.LoadAsync(api, org);
        Assert.Null(stock.Error);
        var reagent = stock.Items.Single(i => i.Name == "IT Reagent");
        Assert.Equal(50m, reagent.CurrentStock);
        Assert.True((await InventoryService.RecordUsageAsync(api, org, session.UserId, reagent, "5", "integration run")).Ok);
        Assert.Equal(45m, (await InventoryService.LoadAsync(api, org)).Items.Single(i => i.Name == "IT Reagent").CurrentStock);
        Assert.True((await InventoryService.RecordPurchaseAsync(api, org, session.UserId, reagent, "20", "4", "Supplier")).Ok);
        Assert.Equal(65m, (await InventoryService.LoadAsync(api, org)).Items.Single(i => i.Name == "IT Reagent").CurrentStock);
        var tooMuch = reagent with { CurrentStock = 65m };
        Assert.False((await InventoryService.RecordUsageAsync(api, org, session.UserId, tooMuch, "999", null)).Ok); // more than is in stock is refused

        // Sending a test to an external lab updates the real row and the books follow (Dr Outsourcing Expense / Cr Outsource Payable).
        await engine.PullCatalogAsync(force: true);
        Assert.Contains(store.GetCatalog().ExternalLabList, l => l.Name == "IT External Lab");
        var lft = store.SearchWorklist("", ["pending"]).Single(r => r.TestName == "LFT" && r.PatientName.StartsWith("Native Integration Patient"));
        new ResultService(store, org, session.UserId).Outsource(lft.Id, "99999999-0000-0000-0000-0000000000e1", "180");
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var lftRow = (await api.SelectAsync("patient_tests", $"select=external_lab_id,outsource_cost,outsource_journal_entry_id&id=eq.{lft.Id}")).Body!.Value[0];
        Assert.Equal(("99999999-0000-0000-0000-0000000000e1", 180m), (lftRow.GetProperty("external_lab_id").GetString(), lftRow.GetProperty("outsource_cost").GetDecimal()));
        Assert.NotEqual(System.Text.Json.JsonValueKind.Null, lftRow.GetProperty("outsource_journal_entry_id").ValueKind); // the books were posted

        // A discounted bill: what is owed is final_amount, so paying exactly that settles it on the server too.
        var second = new VisitService(store).Register(new RegisterVisitInput(org, Env("LIMS_IT_LAB"), DateTime.UtcNow.ToString("yyyy-MM-dd"),
            [new VisitTest("CBC", 300), new VisitTest("LFT", 450)], NewPatient: new NewPatient("Discount Patient", $"9{Random.Shared.Next(100000000, 999999999)}")));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var discounted = await api.PatchAsync("invoices", $"id=eq.{second.VisitId}&organization_id=eq.{org}", new { discount_amount = 100, final_amount = 650 });
        Assert.True(discounted.Ok, discounted.ErrorMessage);
        await engine.PullInvoicesAsync();
        var owed = store.GetInvoice(second.VisitId)!;
        Assert.Equal((650m, 100m), (owed.TotalAmount, owed.Discount));
        new PaymentService(store, org).Record(new PaymentInput(second.VisitId, 650m, "cash"));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var settled = (await api.SelectAsync("invoices", $"select=payment_status,paid_amount,final_amount&id=eq.{second.VisitId}")).Body!.Value[0];
        Assert.Equal(("paid", 650m), (settled.GetProperty("payment_status").GetString(), settled.GetProperty("paid_amount").GetDecimal()));

        // Payments taken anywhere reach this PC: a fresh PC pulling from the real server sees them, with the payment of this test among them.
        var freshPath = Path.Combine(Path.GetTempPath(), $"labshope-it2-{Guid.NewGuid():N}.db");
        using (var fresh = new LocalStore(freshPath))
        {
            await new SyncEngine(fresh, api, org).PullPaymentsAsync();
            var seen = fresh.PaymentsFor(visit.VisitId);
            Assert.Equal(2, seen.Count); // the 300 and the 450 paid earlier in this test
            Assert.Equal(750m, seen.Sum(p => p.Amount));
            Assert.All(seen, p => Assert.True(p.Synced));
        }
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(freshPath);

        // The books: everything above (bills and payments) was posted automatically, and the Finance screen sees it balanced.
        var books = await Finance.FinanceService.LoadAsync(api, org, new DateOnly(2020, 4, 1), new DateOnly(2100, 3, 31));
        Assert.Null(books.Error);
        Assert.True(books.Data!.Tallied, $"books out of balance: {books.Data.TotalDebit} vs {books.Data.TotalCredit}");
        Assert.True(books.Data.EntryCount >= 3, "bill and payments should have posted entries");
        var cashAccount = books.Data.Accounts.Single(a => a.Code == "1001");
        Assert.True(cashAccount.TotalDebit >= 750m, $"cash debited {cashAccount.TotalDebit}"); // this test's 300 + 450 payments (plus other tests')
        Assert.True(books.Data.Accounts.Single(a => a.Code == "5009").TotalDebit >= 180m); // the outsourcing expense, and it still balances above

        // The server refuses to be paid twice for the same thing: replaying the same payment changes nothing.
        var payment = store.PaymentsFor(visit.VisitId).First();
        var replay = await api.RpcAsync("record_payment", new { p_payload = new { payment_id = payment.Id, invoice_id = visit.VisitId, organization_id = org, amount = payment.Amount, payment_method = payment.Method } });
        Assert.True(replay.Ok, replay.ErrorMessage);
        Assert.True(replay.Body!.Value.GetProperty("replayed").GetBoolean());

        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(path);
    }
}
