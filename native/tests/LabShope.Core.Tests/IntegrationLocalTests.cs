using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;

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

        var phone = $"+9190{Random.Shared.Next(10000000, 99999999)}";
        var visitId = Guid.NewGuid().ToString();
        var patientId = Guid.NewGuid().ToString();
        var payload = JsonSerializer.Serialize(new
        {
            visit_id = visitId,
            organization_id = org,
            lab_id = Env("LIMS_IT_LAB"),
            collection_center_id = (string?)null,
            test_date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            notes = (string?)null,
            collected_at = DateTimeOffset.UtcNow.ToString("O"),
            patient = new { @new = new { id = patientId, full_name = "Native Integration Patient", phone, phone_variants = new[] { phone } } },
            tests = new[] { new { test_name = "CBC", price = 300, in_package = false }, new { test_name = "LFT", price = 450, in_package = false } },
        });

        store.UpsertPatient(new Patient(patientId, "PENDING", "Native Integration Patient", phone, null, null, Pending: true));
        store.EnqueueVisit(new OutboxItem(visitId, payload, "pending", 0, null, "Native Integration Patient", 750m));

        var engine = new SyncEngine(store, api, org);
        var outcome = await engine.FlushOutboxAsync();
        Assert.Equal(new FlushOutcome(1, 0, null), outcome);
        Assert.Equal("done", store.GetVisit(visitId)!.Status);

        var local = store.GetPatient(patientId)!;
        Assert.NotEqual("PENDING", local.PatientCode);

        // Pull everything back: the patient and the new bill arrive, and can be found by a scan.
        await engine.PullPatientsAsync();
        await engine.PullInvoicesAsync();
        Assert.IsType<ScanMatch.FoundPatient>(store.ResolveScan(local.PatientCode));

        // Sending the very same visit again must not create a second one.
        var replay = await api.RpcAsync("register_visit", new { p_payload = JsonDocument.Parse(payload).RootElement });
        Assert.True(replay.Ok, replay.ErrorMessage);
        Assert.True(replay.Body!.Value.GetProperty("replayed").GetBoolean());

        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(path);
    }
}
