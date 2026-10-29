using Avalonia.Controls;
using Avalonia.Interactivity;
using LabShope.Core.Data;

namespace LabShope.App;

/// <summary>The day's takings by payment method and every receipt, straight from this PC (works offline).</summary>
public partial class CashBookView : UserControl
{
    private readonly LocalStore _store;

    public CashBookView() => throw new InvalidOperationException("Use the constructor with a store.");

    public CashBookView(LocalStore store)
    {
        _store = store;
        InitializeComponent();
        DayPicker.SelectedDate = DateTime.Today;
        DayPicker.SelectedDateChanged += (_, _) => Refresh();
        Refresh();
    }

    public void Refresh()
    {
        var day = (DayPicker.SelectedDate ?? DateTime.Today).Date;
        // Payments are stored in UTC; the "day" is the local calendar day.
        var from = new DateTimeOffset(day, TimeZoneInfo.Local.GetUtcOffset(day)).UtcDateTime;
        var fromIso = Iso(from); var toIso = Iso(from.AddDays(1));

        var rows = _store.PaymentsBetween(fromIso, toIso);
        Grid.ItemsSource = rows;

        var totals = _store.TakingsBetween(fromIso, toIso);
        var all = totals.Sum(t => t.Total);
        SummaryText.Text = rows.Count == 0
            ? "No payments on this day."
            : $"Total {all:0.##} from {rows.Count} payment(s):   " + string.Join("   ", totals.Select(t => $"{t.Method} {t.Total:0.##} ({t.Count})"));
    }

    private static string Iso(DateTime utc) => utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private void OnToday(object? sender, RoutedEventArgs e) => DayPicker.SelectedDate = DateTime.Today;
}
