using System.Text.Json.Nodes;
using LabShope.Core.Data;

namespace LabShope.Core.Visits;

/// <summary>
/// Works through booking requests made on the website: change a status, or mark a request converted once a visit is
/// registered for it. Changes show at once on this PC and are sent to the server later, like everything else.
/// </summary>
public sealed class BookingService
{
    public static readonly string[] Statuses = ["new", "contacted", "scheduled", "converted", "closed"];

    private readonly LocalStore _store;
    private readonly string _organizationId;
    private readonly string? _userId;

    public BookingService(LocalStore store, string organizationId, string? userId)
    {
        _store = store;
        _organizationId = organizationId;
        _userId = userId;
    }

    public BookingRequest SetStatus(string bookingId, string status)
    {
        if (!Statuses.Contains(status)) throw new ArgumentException($"Unknown status: {status}.");
        var booking = _store.GetBooking(bookingId) ?? throw new ArgumentException("That booking isn't on this computer.");
        if (booking.Status == status) return booking;
        return Apply(booking, booking with { Status = status, Waiting = true }, new JsonObject { ["status"] = status });
    }

    /// <summary>Marks the request converted and links it to the patient (the website does the same when a patient is linked).</summary>
    public BookingRequest MarkConverted(string bookingId, string patientId)
    {
        var booking = _store.GetBooking(bookingId) ?? throw new ArgumentException("That booking isn't on this computer.");
        return Apply(booking, booking with { Status = "converted", PatientId = patientId, Waiting = true },
            new JsonObject { ["status"] = "converted", ["patient_id"] = patientId, ["converted_by"] = _userId });
    }

    private BookingRequest Apply(BookingRequest before, BookingRequest after, JsonObject patch)
    {
        var payload = new JsonObject
        {
            ["id"] = before.Id,
            ["organization_id"] = _organizationId,
            ["patch"] = patch,
            ["previous"] = new JsonObject { ["status"] = before.Status, ["patient_id"] = before.PatientId },
        };
        _store.InTransaction(() =>
        {
            _store.UpsertBooking(after);
            _store.EnqueueVisit(new OutboxItem($"booking-{before.Id}-{Guid.NewGuid():N}", payload.ToJsonString(), "pending", 0, null, before.FullName, 0m, Kind: "booking"));
        });
        return after;
    }
}
