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

        // The books: everything above (bills and payments) was posted automatically, and the Finance screen sees it balanced.
        var books = await Finance.FinanceService.LoadAsync(api, org, new DateOnly(2020, 4, 1), new DateOnly(2100, 3, 31));
        Assert.Null(books.Error);
        Assert.True(books.Data!.Tallied, $"books out of balance: {books.Data.TotalDebit} vs {books.Data.TotalCredit}");
        Assert.True(books.Data.EntryCount >= 3, "bill and payments should have posted entries");
        var cashAccount = books.Data.Accounts.Single(a => a.Code == "1001");
        Assert.True(cashAccount.TotalDebit >= 750m, $"cash debited {cashAccount.TotalDebit}"); // this test's 300 + 450 payments (plus other tests')

        // The server refuses to be paid twice for the same thing: replaying the same payment changes nothing.
        var payment = store.PaymentsFor(visit.VisitId).First();
        var replay = await api.RpcAsync("record_payment", new { p_payload = new { payment_id = payment.Id, invoice_id = visit.VisitId, organization_id = org, amount = payment.Amount, payment_method = payment.Method } });
        Assert.True(replay.Ok, replay.ErrorMessage);
        Assert.True(replay.Body!.Value.GetProperty("replayed").GetBoolean());

        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(path);
    }
}
