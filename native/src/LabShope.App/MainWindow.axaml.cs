using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
using Avalonia.Threading;
using LabShope.Core.Data;
using LabShope.Core.Scanning;
using LabShope.Core.Sync;
using Material.Icons;
using Material.Icons.Avalonia;

namespace LabShope.App;

public partial class MainWindow : Window
{
    private sealed record Nav(string Key, string Title, MaterialIconKind Icon, Key Hotkey, Func<Control> Create, Func<int>? Badge = null);
    private readonly Dictionary<string, Border> _badges = [];

    private readonly AppSession _session;
    private readonly LocalStore _store;
    private readonly ScanDetector _scanner = new();
    private readonly Dictionary<string, Control> _pages = [];
    private readonly Dictionary<string, Button> _navButtons = [];
    private readonly List<Nav> _nav;
    private readonly InstrumentHost _instruments;
    private string _current = "";
    private bool _syncing;
    private DispatcherTimer? _scanHide;

    public MainWindow() => throw new InvalidOperationException("Use the constructor with a session.");

    public MainWindow(AppSession session)
    {
        _session = session;
        _store = session.Store;
        InitializeComponent();
        _instruments = new InstrumentHost(session);
        _instruments.Changed += () => { RefreshBadges(); if (_pages.TryGetValue("results", out var r)) ((ResultsView)r).Refresh(); };
        Closed += (_, _) => _instruments.Dispose();
        LabText.Text = session.Workspace.OrganizationName;
        UserText.Text = session.Account.SavedEmail ?? "";
        Title = $"LabShope LIMS - {session.Workspace.OrganizationName}";

        _nav =
        [
            new("home", "Overview", MaterialIconKind.ViewDashboardOutline, Key.F1, () =>
            {
                var v = new OverviewView(session);
                v.RegisterRequested += () => Show("register");
                v.ResultsRequested += () => Show("results");
                v.BillsRequested += () => Show("bills");
                return v;
            }),
            new("register", "Register visit", MaterialIconKind.ClipboardPlusOutline, Key.F4, () =>
            {
                var v = new RegisterVisitView(session);
                v.Registered += async () => { RefreshPages(); await SyncAsync(); };
                return v;
            }),
            new("bookings", "Booking requests", MaterialIconKind.CalendarClockOutline, Key.F12, () =>
            {
                var v = new BookingsView(session);
                v.Changed += async () => { RefreshBadges(); await SyncAsync(); };
                v.RegisterRequested += booking => { Show("register"); ((RegisterVisitView)_pages["register"]).PrefillFromBooking(booking); };
                return v;
            }, Badge: () => _store.NewBookingCount()),
            new("patients", "Patients", MaterialIconKind.AccountGroupOutline, Key.F2, () =>
            {
                var v = new PatientRegisterView(session);
                v.PatientEdited += async () => await SyncAsync();
                v.RegisterVisitRequested += patient => { Show("register"); ((RegisterVisitView)_pages["register"]).UsePatient(patient); };
                return v;
            }),
            new("instruments", "Lab machines", MaterialIconKind.AccessPoint, Key.None, () =>
            {
                var v = new InstrumentsView(session, _instruments);
                v.ResultAccepted += async () => { RefreshPages(); await SyncAsync(); };
                return v;
            }, Badge: () => _store.NewInstrumentCount()),
            new("results", "Results", MaterialIconKind.TestTube, Key.F5, () =>
            {
                var v = new ResultsView(session);
                v.ResultSaved += async () => { RefreshPages(); await SyncAsync(); };
                return v;
            }),
            new("bills", "Bills & payments", MaterialIconKind.ReceiptTextOutline, Key.F3, () =>
            {
                var v = new BillsView(session);
                v.PaymentTaken += async () => { RefreshPages(); await SyncAsync(); };
                return v;
            }),
            new("cash", "Daily cash book", MaterialIconKind.CashMultiple, Key.F7, () => new CashBookView(_store)),
            new("reports", "Reports", MaterialIconKind.ChartBoxOutline, Key.F6, () => new ReportsView(session)),
            new("inventory", "Inventory", MaterialIconKind.PackageVariantClosed, Key.None, () => new InventoryView(session)),
            new("organization", "Labs & team", MaterialIconKind.OfficeBuildingOutline, Key.None, () =>
            {
                var v = new OrganizationView(session);
                v.CatalogChanged += async () => { await ForceCatalogAsync(); };
                return v;
            }),
            new("catalog", "Test catalog", MaterialIconKind.FlaskOutline, Key.None, () =>
            {
                var v = new CatalogView(session);
                v.CatalogChanged += async () => { await ForceCatalogAsync(); };
                return v;
            }),
        ];
        // The books are for admins and staff, not collectors.
        if (session.Workspace.Roles is null || session.Workspace.Roles.Any(r => r is "admin" or "employee"))
            _nav.Add(new("finance", "Finance", MaterialIconKind.BankOutline, Key.None, () => new FinanceView(session)));
        _nav.Add(new("settings", "Sync & settings", MaterialIconKind.CogOutline, Key.None, () =>
            {
                var v = new SettingsView(session) { Updater = _updater };
                v.SyncRequested += async () => await SyncAsync();
                v.QueueChanged += () => RefreshPages();
                v.LabProfileChanged += async () =>
                {
                    // Fetch the new name, logo and report footer now, so reports and receipts printed next already use them.
                    if (_session.Engine is not null) { try { await _session.Engine.PullBrandingAsync(_session.Workspace.Slug, _session.Workspace.OrganizationName, force: true); } catch (SyncException) { } }
                    RefreshPages();
                };
                return v;
            }, Badge: () => _store.OutboxCounts().Failed));

        foreach (var n in _nav)
        {
            var button = new Button { Classes = { "nav" }, Content = Row(n, _badges), HorizontalContentAlignment = Avalonia.Layout.HorizontalAlignment.Stretch };
            button.Click += (_, _) => Show(n.Key);
            _navButtons[n.Key] = button;
            NavPanel.Children.Add(button);
        }

        AddHandler(KeyDownEvent, OnKeyDown, RoutingStrategies.Tunnel); // hotkeys and barcode scans work from anywhere
        ReceiptPrinter.Configure(session.Store);
        ReceiptPrinter.PrintProblem += message => Dispatcher.UIThread.Post(() => Toast(message));
        ErrorNotice.Occurred += () => Dispatcher.UIThread.Post(() => Toast("Something went wrong. Your work is safe; details were saved to the log."));

        Show("home");
        RefreshBadges();
        _instruments.Apply(LabShope.Core.Analyzers.InstrumentSettings.Load(_store)); // start whatever this computer was set up to listen to

        var syncTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(60) };
        syncTimer.Tick += async (_, _) => await SyncAsync();
        syncTimer.Start();
        _updater.Changed += () => Dispatcher.UIThread.Post(ShowUpdateState);
        var updateTimer = new DispatcherTimer { Interval = TimeSpan.FromHours(6) };
        updateTimer.Tick += async (_, _) => await _updater.RunAsync();
        updateTimer.Start();
        Opened += async (_, _) =>
        {
            // A little after start-up, look for a newer version in the background (not in the way of the first sync).
            _ = Task.Delay(TimeSpan.FromSeconds(30)).ContinueWith(_ => Dispatcher.UIThread.Post(async () => await _updater.RunAsync()));
            if (session.StartupNotice is { } notice) { Toast(notice); _scanHide?.Stop(); } // stays until the next message
            await SyncAsync();
        };

        Shot.Attach(this);
    }

    private static Control Row(Nav n, Dictionary<string, Border> badges)
    {
        var count = new TextBlock { FontSize = 11, FontWeight = FontWeight.SemiBold, Foreground = Brushes.White };
        var badge = new Border
        {
            Background = new SolidColorBrush(Color.Parse("#E5484D")), CornerRadius = new CornerRadius(10), Padding = new Thickness(7, 1), IsVisible = false,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center, Child = count,
        };
        badges[n.Key] = badge;
        var row = new DockPanel { HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Stretch };
        DockPanel.SetDock(badge, Dock.Right);
        row.Children.Add(badge);
        row.Children.Add(new StackPanel
        {
            Orientation = Avalonia.Layout.Orientation.Horizontal,
            Spacing = 12,
            Children =
            {
                new MaterialIcon { Kind = n.Icon, Width = 19, Height = 19 },
                new TextBlock { Text = n.Title, VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center },
            },
        });
        return row;
    }

    /// <summary>Little red counts on the sidebar (new booking requests).</summary>
    private void RefreshBadges()
    {
        foreach (var n in _nav.Where(n => n.Badge is not null))
        {
            var count = n.Badge!();
            var badge = _badges[n.Key];
            badge.IsVisible = count > 0;
            ((TextBlock)badge.Child!).Text = count > 99 ? "99+" : count.ToString();
        }
    }

    /// <summary>Opens a page (created the first time, then kept so nothing typed is lost when switching).</summary>
    public void Show(string key)
    {
        var nav = _nav.First(n => n.Key == key);
        if (!_pages.TryGetValue(key, out var page)) _pages[key] = page = nav.Create();
        _current = key;
        Page.Content = page;
        PageTitle.Text = nav.Title;
        foreach (var (k, b) in _navButtons) b.Classes.Set("active", k == key);
        RefreshPage(page);
        (page as RegisterVisitView)?.FocusFirstField();
        if (page is FinanceView finance) _ = finance.EnsureLoadedAsync();
        if (page is InventoryView inventory) _ = inventory.EnsureLoadedAsync();
    }

    private static void RefreshPage(Control page)
    {
        switch (page)
        {
            case OverviewView o: o.Refresh(); break;
            case PatientRegisterView p: p.Refresh(); break;
            case BillsView b: b.Refresh(); break;
            case ResultsView r: r.Refresh(); break;
            case CashBookView c: c.Refresh(); break;
            case ReportsView rv: rv.Refresh(); break;
            case CatalogView cv: cv.Refresh(); break;
            case BookingsView bv: bv.Refresh(); break;
            case OrganizationView ov: ov.Refresh(); break;
            case SettingsView sv: sv.Refresh(); break;
            case InstrumentsView iv: iv.Refresh(); break;
            case InventoryView: break; // loaded from the server on first view; has its own Refresh
            case FinanceView: break; // the books are not on this PC; refreshed with its own button
            case RegisterVisitView v: v.ReloadCatalog(); break;
        }
    }

    private void RefreshPages()
    {
        RefreshBadges();
        foreach (var page in _pages.Values) RefreshPage(page);
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.F11) { e.Handled = true; ToggleFullScreen(); return; }
        if (e.Key == Key.Escape && WindowState == WindowState.FullScreen) { e.Handled = true; ToggleFullScreen(); return; }
        if (e.Key == Key.F9) { e.Handled = true; _ = SyncAsync(); return; }
        if (_nav.FirstOrDefault(n => n.Hotkey == e.Key) is { } hit) { e.Handled = true; Show(hit.Key); return; }

        if (e.KeyModifiers is not (KeyModifiers.None or KeyModifiers.Shift)) return;
        var key = e.Key switch { Key.Enter or Key.Return => "Enter", Key.Tab => "Tab", _ => e.KeySymbol ?? "" };
        var code = _scanner.Push(key, Environment.TickCount64);
        if (code is null) return;

        e.Handled = true;
        var match = _store.ResolveScan(code);
        switch (match)
        {
            case ScanMatch.FoundPatient found: ShowScanned(found.Patient); break;
            case ScanMatch.FoundInvoice { Patient: not null } bill: ShowScanned(bill.Patient); break;
            default: Toast($"No patient or bill found for \"{code}\""); break;
        }
    }

    private void ShowScanned(Patient patient)
    {
        if (_current == "register" && _pages["register"] is RegisterVisitView register)
        {
            register.UsePatient(patient);
        }
        else
        {
            Show("patients");
            ((PatientRegisterView)_pages["patients"]).ShowPatient(patient);
        }
        Toast($"Scanned: {patient.FullName} ({patient.PatientCode})");
    }

    private void Toast(string text)
    {
        ScanText.Text = text;
        ScanChip.IsVisible = true;
        _scanHide?.Stop();
        _scanHide = new DispatcherTimer { Interval = TimeSpan.FromSeconds(6) };
        _scanHide.Tick += (_, _) => { ScanChip.IsVisible = false; _scanHide!.Stop(); };
        _scanHide.Start();
    }

    private readonly AppUpdater _updater = AppUpdater.Create();

    private void ShowUpdateState()
    {
        var ready = _updater.State == UpdateState.Ready;
        UpdateChip.IsVisible = ready || _updater.State == UpdateState.Downloading;
        UpdateChip.IsEnabled = ready;
        UpdateText.Text = ready ? $"Update {_updater.NewVersion} ready: restart" : $"Downloading update {_updater.NewVersion}… {_updater.Percent}%";
    }

    private async void OnUpdateChip(object? sender, RoutedEventArgs e)
    {
        if (_updater.State != UpdateState.Ready) return;
        var confirm = new ConfirmDialog($"Update to version {_updater.NewVersion}?", "LabShope LIMS closes and opens again on the new version. Anything not sent yet stays safe on this computer and is sent afterwards.", "Restart and update");
        await confirm.ShowDialog(this);
        if (confirm.Confirmed) _updater.ApplyAndRestart();
    }

    /// <summary>After a catalog change, pull the new values straight away instead of waiting for the next refresh.</summary>
    private async Task ForceCatalogAsync()
    {
        if (_session.Engine is not null) { try { await _session.Engine.PullCatalogAsync(force: true); } catch (SyncException) { } }
        RefreshPages();
    }

    private async void OnSync(object? sender, RoutedEventArgs e) => await SyncAsync();

    private async Task SyncAsync()
    {
        if (_syncing) return;
        _syncing = true;
        SetChip("Syncing…", "#0B81B7", "#E7F3F9");
        try
        {
            LabShope.Core.Data.DatabaseGuard.BackupIfDue(_store, System.IO.Path.Combine(AppConfig.DataDirectory, "backups", _session.Workspace.OrganizationId), 7, DateTime.Now); // a new day, a new backup
            var status = await _session.Sync.RunOnceAsync();
            if (_pages.TryGetValue("settings", out var settings)) ((SettingsView)settings).ShowStatus(status);
            var waiting = status.Pending > 0 ? $" · {status.Pending} waiting to send" : "";
            if (status.NeedsSignIn) SetChip("Please sign in again", "#B7791F", "#FDF3DD");
            else if (status.Online && status.Failed > 0) SetChip($"Synced · {status.Failed} need attention", "#B7791F", "#FDF3DD");
            else if (status.Online) SetChip($"Synced {DateTime.Now:HH:mm}{waiting}", "#1E8E5A", "#E3F5EC");
            else SetChip($"Offline · working from this PC{waiting}", "#B7791F", "#FDF3DD");
            RefreshPages();
        }
        finally { _syncing = false; }
    }

    private void SetChip(string text, string fg, string bg)
    {
        SyncText.Text = text;
        var fgBrush = new SolidColorBrush(Color.Parse(fg));
        SyncText.Foreground = fgBrush;
        SyncDot.Fill = fgBrush;
        SyncChip.Background = new SolidColorBrush(Color.Parse(bg));
    }

    private void OnFullScreen(object? sender, RoutedEventArgs e) => ToggleFullScreen();

    private void ToggleFullScreen() => WindowState = WindowState == WindowState.FullScreen ? WindowState.Normal : WindowState.FullScreen;

    private void OnSignOut(object? sender, RoutedEventArgs e)
    {
        _session.Account.SignOut();
        Close();
    }
}
