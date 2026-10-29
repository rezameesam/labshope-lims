using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Visits;

namespace LabShope.App;

/// <summary>Bookings made by patients on the website. Work them offline: change a status, or register the visit straight from a request.</summary>
public partial class BookingsView : UserControl
{
    private readonly AppSession _session;
    private readonly BookingService _service;
    private BookingRequest? _current;
    private bool _loading;

    /// <summary>Raised when the user wants to register a visit for a booking request.</summary>
    public event Action<BookingRequest>? RegisterRequested;

    /// <summary>Raised after a status change so the window can send it and update the sidebar count.</summary>
    public event Action? Changed;

    public BookingsView() => throw new InvalidOperationException("Use the constructor with a session.");

    public BookingsView(AppSession session)
    {
        _session = session;
        _service = new BookingService(session.Store, session.Workspace.OrganizationId, session.Account.SavedUserId);
        InitializeComponent();
        StatusBox.ItemsSource = BookingService.Statuses;
        FilterBox.SelectionChanged += (_, _) => Refresh();
        SearchBox.TextChanged += (_, _) => Refresh();
        Grid.SelectionChanged += (_, _) => Pick(Grid.SelectedItem as BookingRequest);
        StatusBox.SelectionChanged += OnStatusPicked;
        Refresh();
    }

    private string? StatusFilter() => FilterBox.SelectedIndex switch { 0 => "new", 1 => null, 2 => "contacted", 3 => "scheduled", 4 => "converted", _ => "closed" };

    public void Refresh()
    {
        var keep = _current?.Id;
        var rows = _session.Store.SearchBookings(SearchBox.Text ?? "", StatusFilter());
        Grid.ItemsSource = rows;
        CountText.Text = $"{rows.Count} request(s)";
        if (keep is not null) Grid.SelectedItem = rows.FirstOrDefault(r => r.Id == keep);
    }

    private void Pick(BookingRequest? b)
    {
        _current = b;
        MessageText.Text = "";
        DetailPanel.IsVisible = b is not null;
        EmptyPanel.IsVisible = b is null;
        if (b is null) return;

        NameText.Text = b.FullName;
        ContactText.Text = string.Join("  ·  ", new[] { b.Phone, b.Email }.Where(x => !string.IsNullOrWhiteSpace(x)));
        TestsText.Text = string.IsNullOrWhiteSpace(b.TestDetails) ? "(nothing written)" : b.TestDetails;
        WhenText.Text = $"{b.Type}" + (string.IsNullOrWhiteSpace(b.PreferredDate) ? "" : $"  ·  preferred date {b.PreferredDate}") + $"  ·  received {b.Created}";
        NotesText.Text = string.IsNullOrWhiteSpace(b.Notes) ? "" : $"Notes: {b.Notes}";
        _loading = true; StatusBox.SelectedItem = b.Status; _loading = false;
        RegisterButton.IsEnabled = b.Status != "closed";
    }

    private void OnStatusPicked(object? sender, SelectionChangedEventArgs e)
    {
        if (_loading || _current is null || StatusBox.SelectedItem is not string status || status == _current.Status) return;
        try
        {
            _service.SetStatus(_current.Id, status);
            Refresh();
            Changed?.Invoke();
        }
        catch (ArgumentException ex) { MessageText.Text = ex.Message; }
    }

    private void OnRegister(object? sender, RoutedEventArgs e)
    {
        if (_current is not null) RegisterRequested?.Invoke(_current);
    }
}
