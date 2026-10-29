namespace LabShope.App;

/// <summary>Lets the safety net tell the open window that something went wrong (it shows a short notice).</summary>
public static class ErrorNotice
{
    public static event Action? Occurred;
    public static void Raise() => Occurred?.Invoke();
}
