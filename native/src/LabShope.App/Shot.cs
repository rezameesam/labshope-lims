using Avalonia.Controls;
using Avalonia.Media.Imaging;

namespace LabShope.App;

/// <summary>Development aid: with LABSHOPE_SHOT=/path/out.png a window saves a picture of itself and closes.</summary>
public static class Shot
{
    public static void Attach(Window window)
    {
        if (Environment.GetEnvironmentVariable("LABSHOPE_SHOT") is not { Length: > 0 } path) return;
        window.Opened += async (_, _) =>
        {
            await Task.Delay(1500);
            using var bitmap = new RenderTargetBitmap(new Avalonia.PixelSize((int)window.Bounds.Width, (int)window.Bounds.Height));
            bitmap.Render(window);
            bitmap.Save(path);
            window.Close();
        };
    }
}
