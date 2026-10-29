using Avalonia.Data.Converters;
using Avalonia.Media;

namespace LabShope.App;

/// <summary>Colours for status badges (paid, partial, pending, abnormal...), used by the tables.</summary>
public static class Pills
{
    private static IBrush B(string hex) => new SolidColorBrush(Color.Parse(hex));

    private static (string Fg, string Bg) Colors(string? status) => (status ?? "").ToLowerInvariant() switch
    {
        "paid" or "normal" or "completed" or "sent" or "accepted" or "ok" => ("#1E8E5A", "#E3F5EC"),
        "partial" or "pending" or "waiting" or "in_progress" or "new" or "low" => ("#B7791F", "#FDF3DD"),
        "abnormal" or "cancelled" or "failed" or "out" => ("#C53030", "#FDE8E8"),
        _ => ("#5C7083", "#EAF0F4"),
    };

    public static readonly IValueConverter Foreground = new FuncValueConverter<string?, IBrush?>(s => B(Colors(s).Fg));
    public static readonly IValueConverter Background = new FuncValueConverter<string?, IBrush?>(s => B(Colors(s).Bg));
    public static readonly IValueConverter Visible = new FuncValueConverter<string?, bool>(s => !string.IsNullOrWhiteSpace(s));
}
