using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

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

        // The server refuses to be paid twice for the same thing: replaying the same payment changes nothing.
        var payment = store.PaymentsFor(visit.VisitId).First();
        var replay = await api.RpcAsync("record_payment", new { p_payload = new { payment_id = payment.Id, invoice_id = visit.VisitId, organization_id = org, amount = payment.Amount, payment_method = payment.Method } });
        Assert.True(replay.Ok, replay.ErrorMessage);
        Assert.True(replay.Body!.Value.GetProperty("replayed").GetBoolean());

        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(path);
    }
}
