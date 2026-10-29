using System.Net;
using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;

namespace LabShope.Core.Tests;

public class BookingTests : IDisposable
{
    private const string Org = "org-1";
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"labshope-{Guid.NewGuid():N}.db");
    private readonly LocalStore _store;
    private readonly BookingService _bookings;

    public BookingTests()
    {
        _store = new LocalStore(_path);
        _bookings = new BookingService(_store, Org, "user-1");
        _store.UpsertBooking(new BookingRequest("b1", "Meera Nair", "9811111111", "m@x.in", "home_collection", "2026-10-30", "CBC, Vitamin D", "after 8am", "new", null, "2026-10-29T03:00:00+00:00"));
        _store.UpsertBooking(new BookingRequest("b2", "Ravi Kumar", "9822222222", null, "walk_in", null, "LFT", null, "contacted", null, "2026-10-28T03:00:00+00:00"));
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    [Fact]
    public void ListsNewestFirstFiltersByStatusAndSearches()
    {
        Assert.Equal(["Meera Nair", "Ravi Kumar"], _store.SearchBookings("").Select(b => b.FullName));
        Assert.Equal(["Ravi Kumar"], _store.SearchBookings("", "contacted").Select(b => b.FullName));
        Assert.Equal(["Meera Nair"], _store.SearchBookings("vitamin").Select(b => b.FullName));
        Assert.Equal(1, _store.NewBookingCount());
    }

    [Fact]
    public void ChangingTheStatusShowsAtOnceAndQueuesAnUpdateOfThatBooking()
    {
        var done = _bookings.SetStatus("b1", "contacted");

        Assert.Equal(("contacted", true), (done.Status, done.Waiting));
        Assert.Equal(0, _store.NewBookingCount());
        Assert.Equal((1, 0), _store.OutboxCounts());
        Assert.Throws<ArgumentException>(() => _bookings.SetStatus("b1", "teleported"));
        Assert.Throws<ArgumentException>(() => _bookings.SetStatus("nope", "closed"));
    }

    [Fact]
    public async Task SendsTheChangeAndLinksTheConvertedPatient()
    {
        _bookings.MarkConverted("b1", "patient-9");
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[{\"id\":\"b1\"}]") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(new FlushOutcome(1, 0, null), outcome);
        var call = server.Requests.Single();
        Assert.Contains("/rest/v1/booking_requests?id=eq.b1&organization_id=eq.org-1", call.Url);
        var body = JsonDocument.Parse(call.Body).RootElement;
        Assert.Equal(("converted", "patient-9", "user-1"), (body.GetProperty("status").GetString(), body.GetProperty("patient_id").GetString(), body.GetProperty("converted_by").GetString()));
        Assert.False(_store.GetBooking("b1")!.Waiting);
    }

    [Fact]
    public async Task AChangeTheServerRefusesPutsTheBookingBack()
    {
        _bookings.SetStatus("b1", "closed");
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, "[]") };

        var outcome = await new SyncEngine(_store, Api(server), Org).FlushOutboxAsync();

        Assert.Equal(1, outcome.Failed);
        Assert.Equal("new", _store.GetBooking("b1")!.Status);
    }

    [Fact]
    public async Task APullBringsNewRequestsButNeverOverwritesAChangeStillWaiting()
    {
        _bookings.SetStatus("b1", "scheduled");
        const string rows = """
            [{"id":"b1","full_name":"Meera Nair","phone":"9811111111","email":null,"booking_type":"home_collection","preferred_date":null,"test_details":"CBC","notes":null,"status":"new","patient_id":null,"created_at":"2026-10-29T03:00:00+00:00","updated_at":"2026-10-29T08:00:00+00:00"},
             {"id":"b3","full_name":"New Person","phone":"9833333333","email":null,"booking_type":"walk_in","preferred_date":null,"test_details":"TSH","notes":null,"status":"new","patient_id":null,"created_at":"2026-10-29T08:30:00+00:00","updated_at":"2026-10-29T08:30:00+00:00"}]
            """;
        var server = new FakeServer { Handler = (_, _) => (HttpStatusCode.OK, rows) };

        await new SyncEngine(_store, Api(server), Org).PullBookingsAsync();

        Assert.Equal("scheduled", _store.GetBooking("b1")!.Status);        // ours, still waiting
        Assert.Equal("New Person", _store.GetBooking("b3")!.FullName);     // a new request from the website
        Assert.Equal(1, _store.NewBookingCount());
    }

    public void Dispose()
    {
        _store.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_path);
    }
}
