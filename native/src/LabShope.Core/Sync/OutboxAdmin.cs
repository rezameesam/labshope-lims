using System.Text.Json;
using LabShope.Core.Data;

namespace LabShope.Core.Sync;

/// <summary>
/// What staff can do with a refused item. Retry sends it again (after fixing the cause). Discard throws it away and tidies up
/// what it left on this PC, so a visit that was refused doesn't linger as a bill nobody can collect.
/// </summary>
public static class OutboxAdmin
{
    public static void Retry(LocalStore store, string id) => store.RetryOutboxEntry(id);

    public static void Discard(LocalStore store, string id)
    {
        var json = store.GetOutboxPayload(id);
        if (json is null) return;
        var item = store.ListOutbox().FirstOrDefault(e => e.Id == id);

        if (item?.Kind == "visit")
        {
            var payload = JsonDocument.Parse(json).RootElement;
            var testIds = payload.TryGetProperty("tests", out var tests)
                ? tests.EnumerateArray().Select(t => t.TryGetProperty("id", out var i) ? i.GetString() : null).Where(i => i is not null).Select(i => i!).ToList()
                : [];

            // A patient created only for this visit goes too, unless something else already uses them.
            string? provisionalPatient = payload.TryGetProperty("patient", out var p) && p.TryGetProperty("new", out var n) ? n.GetProperty("id").GetString() : null;
            store.DeleteLocalVisit(id, testIds);
            if (provisionalPatient is not null && !store.PatientIsStillUsed(provisionalPatient, id) && store.GetPatient(provisionalPatient) is { Pending: true })
                store.DeletePatient(provisionalPatient);
            return;
        }

        // Payments, results, patient edits and booking updates: the screens already showed the old value again when the server refused
        // them, so there is nothing left to undo. Just drop the item.
        store.DeleteOutboxEntry(id);
    }
}
