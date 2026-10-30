using System.Net;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Interactivity;
using LabShope.Core.Data;
using LabShope.Core.Net;

namespace LabShope.App.Tests;

/// <summary>The "New test" and "Add staff" windows: what they send to the server and what they say when it refuses.</summary>
public class SetupDialogTests
{
    private sealed class Server(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public List<(string Url, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            Calls.Add((r.RequestUri!.ToString(), r.Content is null ? "" : await r.Content.ReadAsStringAsync(ct)));
            return new HttpResponseMessage(status) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };
        }
    }

    private static SupabaseApi Api(HttpMessageHandler h) =>
        new(new HttpClient(h), "https://x.supabase.co", "anon") { Session = new AuthSession("t", "r", DateTimeOffset.UtcNow.AddHours(1), "u", null) };

    private static async Task Click(Window window, string button)
    {
        window.FindControl<Button>(button)!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        for (var i = 0; i < 100 && !window.FindControl<Button>(button)!.IsEnabled; i++) await Task.Delay(20); // waits while the request is in flight
    }

    [AvaloniaFact]
    public async Task ANewTestIsSentWithItsCodeAndTheWindowCloses()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var catalog = new Catalog([new CatalogTest("t1", "CBC001", "Complete Blood Count", 350m, null)], [], [], [], [], [new TestCategory("c1", "Haematology")]);
        var dialog = new NewTestDialog(Api(server), "org-1", catalog);
        dialog.Show();

        dialog.FindControl<TextBox>("NameBox")!.Text = "Complete Blood Count (Paediatric)";
        dialog.FindControl<TextBox>("PriceBox")!.Text = "300";
        await Click(dialog, "SaveButton");

        Assert.True(dialog.Saved);
        var call = Assert.Single(server.Calls);
        Assert.Contains("/rest/v1/tests", call.Url);
        Assert.Contains("\"test_id\":\"CBC002\"", call.Body);
        Assert.Contains("\"organization_id\":\"org-1\"", call.Body);
    }

    [AvaloniaFact]
    public async Task ANewTestWithoutANameShowsTheProblemAndSendsNothing()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var dialog = new NewTestDialog(Api(server), "org-1", new Catalog([], [], [], [], []));
        dialog.Show();

        await Click(dialog, "SaveButton");

        Assert.False(dialog.Saved);
        Assert.True(dialog.FindControl<Border>("ErrorBox")!.IsVisible);
        Assert.Contains("test name", dialog.FindControl<TextBlock>("ErrorText")!.Text);
        Assert.Empty(server.Calls);
    }

    [AvaloniaFact]
    public async Task AddingStaffSendsTheAccountAndAServerRefusalIsShown()
    {
        var labs = new[] { new LabRef("lab-1", "Main Lab", "ML") };

        var ok = new Server(HttpStatusCode.OK, """{"user_id":"u1","employee_row_id":"e1"}""");
        var dialog = new StaffDialog(Api(ok), "org-1", labs, "lab-1");
        dialog.Show();
        dialog.FindControl<TextBox>("NameBox")!.Text = "Asha Rao";
        dialog.FindControl<TextBox>("EmailBox")!.Text = "asha@lab.com";
        dialog.FindControl<TextBox>("PasswordBox")!.Text = "longenough1";
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        Assert.Contains("/functions/v1/create-employee", Assert.Single(ok.Calls).Url);
        Assert.Contains("\"lab_id\":\"lab-1\"", ok.Calls[0].Body);

        var refused = new Server(HttpStatusCode.Forbidden, """{"error":"Only admins can create employees"}""");
        var second = new StaffDialog(Api(refused), "org-1", labs, "lab-1");
        second.Show();
        second.FindControl<TextBox>("NameBox")!.Text = "Asha Rao";
        second.FindControl<TextBox>("EmailBox")!.Text = "asha@lab.com";
        second.FindControl<TextBox>("PasswordBox")!.Text = "longenough1";
        await Click(second, "SaveButton");
        Assert.False(second.Saved);
        Assert.Contains("Only an admin", second.FindControl<TextBlock>("ErrorText")!.Text);
    }

    [AvaloniaFact]
    public void DateOfBirthIsPickedFromACalendarShownDayFirstAndCannotBeInTheFuture()
    {
        var store = new LocalStore(Path.Combine(Path.GetTempPath(), $"labshope-dob-{Guid.NewGuid():N}.db"));
        try
        {
            var patient = new Patient("p1", "IRM-0001", "Asha Rao", "9876543210", "female", "1985-03-07", Email: "asha@example.com");
            store.UpsertPatient(patient);
            var dialog = new PatientDialog(new LabShope.Core.Visits.PatientService(store, "org-1"), patient);
            dialog.Show();

            var picker = dialog.FindControl<CalendarDatePicker>("DobBox")!;
            Assert.Equal(new DateTime(1985, 3, 7), picker.SelectedDate);
            Assert.Equal("dd/MM/yyyy", picker.CustomDateFormatString);
            Assert.Equal(DateTime.Today, picker.DisplayDateEnd);

            Assert.Equal("asha@example.com", dialog.FindControl<TextBox>("EmailBox")!.Text);
            dialog.FindControl<TextBox>("EmailBox")!.Text = "asha.new@example.com";
            picker.SelectedDate = new DateTime(1990, 12, 25);
            Avalonia.LogicalTree.LogicalExtensions.GetLogicalDescendants(dialog).OfType<Button>().First(b => b.Content as string == "Save").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal("1990-12-25", dialog.Result?.DateOfBirth); // stored the way the server expects
            Assert.Equal("asha.new@example.com", dialog.Result?.Email);
        }
        finally { store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); }
    }

    [AvaloniaTheory]
    [InlineData("admin", true)]
    [InlineData("employee", false)]
    [InlineData("collector", false)]
    public void OnlyAnAdminSeesTheButtonsThatAddTestsAndStaff(string role, bool allowed)
    {
        var path = Path.Combine(Path.GetTempPath(), $"labshope-roles-{Guid.NewGuid():N}.db");
        var store = new LocalStore(path);
        try
        {
            var api = Api(new Server(HttpStatusCode.OK, "[]"));
            var session = new AppSession(new LabShope.Core.Account.Workspace("demo", "org-1", "Demo Lab", "l1", [role]), store,
                new LabShope.Core.Sync.SyncRunner(new LabShope.Core.Sync.SyncEngine(store, api, "org-1"), store), new LabShope.Core.Account.AccountService(api, path + ".json"), api);

            var catalog = new CatalogView(session);
            new Window { Content = catalog }.Show();
            Assert.Equal(allowed, catalog.FindControl<Button>("NewButton")!.IsVisible);

            var team = new OrganizationView(session);
            new Window { Content = team }.Show();
            team.FindControl<Button>("TeamButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal(allowed, team.FindControl<StackPanel>("TeamActions")!.IsVisible);
            team.FindControl<Button>("LabsButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal(allowed, team.FindControl<StackPanel>("OrgActions")!.IsVisible);
        }
        finally { store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); }
    }

    [AvaloniaFact]
    public async Task ANewDoctorIsSentAndABadCommissionIsRefusedInPlainWords()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var dialog = new DoctorDialog(Api(server), "org-1", null);
        dialog.Show();
        dialog.FindControl<TextBox>("NameBox")!.Text = "Dr Rao";
        dialog.FindControl<TextBox>("CommissionBox")!.Text = "150";
        await Click(dialog, "SaveButton");
        Assert.Contains("percentage from 0 to 100", dialog.FindControl<TextBlock>("ErrorText")!.Text);
        Assert.Empty(server.Calls);

        dialog.FindControl<TextBox>("CommissionBox")!.Text = "12.5";
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        var call = Assert.Single(server.Calls);
        Assert.Contains("/rest/v1/doctors", call.Url);
        Assert.Contains("\"commission_percentage\":12.5", call.Body);
    }

    [AvaloniaFact]
    public async Task AnExternalLabAndACategoryAreSentAndADuplicateCategoryIsRefused()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var lab = new ExternalLabDialog(Api(server), "org-1", null, null);
        lab.Show();
        lab.FindControl<TextBox>("NameBox")!.Text = "Metro Labs";
        lab.FindControl<TextBox>("GstBox")!.Text = "29ABCDE1234F1Z5";
        await Click(lab, "SaveButton");
        Assert.True(lab.Saved);
        Assert.Contains("/rest/v1/external_labs", server.Calls.Single().Url);
        Assert.Contains("\"gst_number\":\"29ABCDE1234F1Z5\"", server.Calls.Single().Body);

        var category = new CategoryDialog(Api(server), "org-1", ["Haematology"]);
        category.Show();
        category.FindControl<TextBox>("NameBox")!.Text = "haematology";
        await Click(category, "SaveButton");
        Assert.False(category.Saved);
        Assert.Contains("already exists", category.FindControl<TextBlock>("ErrorText")!.Text);
        category.FindControl<TextBox>("NameBox")!.Text = "Biochemistry";
        await Click(category, "SaveButton");
        Assert.True(category.Saved);
        Assert.Equal(2, server.Calls.Count);
    }

    [AvaloniaFact]
    public async Task ALabAndACentreAreSentWithUpperCaseCodesAndBadMapPositionsAreRefused()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var labs = new[] { new LabRef("l1", "Main Lab", "ML") };
        var lab = new LabDialog(Api(server), "org-1", labs, null);
        lab.Show();
        lab.FindControl<TextBox>("CodeBox")!.Text = "br1";
        lab.FindControl<TextBox>("NameBox")!.Text = "Branch One";
        lab.FindControl<TextBox>("LatBox")!.Text = "95";
        await Click(lab, "SaveButton");
        Assert.Contains("Latitude", lab.FindControl<TextBlock>("ErrorText")!.Text);
        Assert.Empty(server.Calls);
        lab.FindControl<TextBox>("LatBox")!.Text = "18.5";
        await Click(lab, "SaveButton");
        Assert.True(lab.Saved);
        Assert.Contains("\"lab_code\":\"BR1\"", server.Calls.Single().Body);

        var center = new CenterDialog(Api(server), "org-1", labs, "l1", null, null);
        center.Show();
        center.FindControl<TextBox>("CodeBox")!.Text = "tn";
        center.FindControl<TextBox>("NameBox")!.Text = "Town Centre";
        await Click(center, "SaveButton");
        Assert.True(center.Saved);
        Assert.Contains("\"lab_id\":\"l1\"", server.Calls[1].Body);
        Assert.Contains("\"code\":\"TN\"", server.Calls[1].Body);
    }

    [AvaloniaFact]
    public async Task ANewItemIsSentWithItsStockAndAnEditLocksTheStockBox()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var dialog = new ItemDialog(Api(server), "org-1", null);
        dialog.Show();
        dialog.FindControl<TextBox>("NameBox")!.Text = "CBC reagent";
        dialog.FindControl<TextBox>("StockBox")!.Text = "25";
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        Assert.Contains("\"current_stock\":25", server.Calls.Single().Body);

        var item = new LabShope.Core.Visits.InventoryItem("i1", "CBC reagent", "supply", "R1", "ml", 25m, 5m, 12.5m, "Acme", "Shelf");
        var edit = new Server(HttpStatusCode.OK, "[{\"id\":\"i1\"}]");
        var editDialog = new ItemDialog(Api(edit), "org-1", item, "Keep cold");
        editDialog.Show();
        Assert.False(editDialog.FindControl<TextBox>("StockBox")!.IsEnabled);
        Assert.Equal("Keep cold", editDialog.FindControl<TextBox>("DescriptionBox")!.Text);
        await Click(editDialog, "SaveButton");
        Assert.True(editDialog.Saved);
        Assert.DoesNotContain("current_stock", edit.Calls.Single().Body);
    }

    [AvaloniaFact]
    public async Task EditingStaffSendsTheFourFieldsAndResettingShowsATemporaryPasswordOnce()
    {
        var person = new TeamMember("e1", "E001", "Asha Rao", "asha@lab.in", "9876543210", "Technician", "Lab", "l1", true);
        var edit = new Server(HttpStatusCode.OK, "[{\"id\":\"e1\"}]");
        var dialog = new StaffEditDialog(Api(edit), "org-1", person);
        dialog.Show();
        Assert.Equal("Asha Rao", dialog.FindControl<TextBox>("NameBox")!.Text);
        dialog.FindControl<TextBox>("DesignationBox")!.Text = "Senior technician";
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        var call = Assert.Single(edit.Calls);
        Assert.Contains("/rest/v1/employees?id=eq.e1&organization_id=eq.org-1", call.Url);
        Assert.Contains("\"designation\":\"Senior technician\"", call.Body);

        var reset = new Server(HttpStatusCode.OK, "{\"success\":true,\"temp_password\":\"Tmp123abc456\"}");
        var resetDialog = new ResetPasswordDialog(Api(reset), person, "https://demo.labshope.com/staff/reset-password");
        resetDialog.Show();
        resetDialog.FindControl<RadioButton>("TempChoice")!.IsChecked = true;
        await Click(resetDialog, "ResetButton");
        Assert.True(resetDialog.FindControl<Border>("ResultBox")!.IsVisible);
        Assert.Equal("Tmp123abc456", resetDialog.FindControl<TextBox>("TempBox")!.Text);
        Assert.Contains("\"mode\":\"temp\"", reset.Calls.Single().Body);

        var bad = new ResetPasswordDialog(Api(new Server(HttpStatusCode.OK, "{}")), person, "https://x");
        bad.Show();
        bad.FindControl<RadioButton>("CustomChoice")!.IsChecked = true;
        bad.FindControl<TextBox>("PasswordBox")!.Text = "123";
        await Click(bad, "ResetButton");
        Assert.Contains("6 characters", bad.FindControl<TextBlock>("ErrorText")!.Text);
    }

    [AvaloniaFact]
    public async Task ANewReportTemplateIsSentWithItsScopeAndLayout()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var catalog = new Catalog([new CatalogTest("t1", "CBC", "CBC", 300m, null)], [], [], [], [], [new TestCategory("c1", "Haematology")]);
        var dialog = new TemplateDialog(Api(server), "org-1", catalog, null);
        dialog.Show();
        dialog.FindControl<TextBox>("NameBox")!.Text = "Haematology report";
        dialog.FindControl<TextBox>("HeaderBox")!.Text = "<h1>{lab_name}</h1>";
        dialog.FindControl<ComboBox>("CategoryBox")!.SelectedIndex = 1;
        dialog.FindControl<ComboBox>("FormatBox")!.SelectedIndex = 1;
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        var body = server.Calls.Single().Body;
        Assert.Contains("/rest/v1/test_templates", server.Calls.Single().Url);
        Assert.Contains("\"test_category\":\"Haematology\"", body);
        Assert.Contains("\"result_format\":\"list\"", body);
        Assert.Contains("{lab_name}", body);

        var blank = new TemplateDialog(Api(server), "org-1", catalog, null);
        blank.Show();
        await Click(blank, "SaveButton");
        Assert.Contains("name is required", blank.FindControl<TextBlock>("ErrorText")!.Text);
    }

    [AvaloniaFact]
    public async Task TheLabProfileLoadsSavesOnlyWhatChangedAndChecksTheLogo()
    {
        var server = new Server(HttpStatusCode.OK, "[{\"display_name\":\"Sunrise\",\"primary_phone\":\"98\",\"primary_email\":\"a@b.in\",\"logo_url\":null,\"setting_key\":\"report_tagline\",\"setting_value\":\"Old line\"}]");
        var dialog = new LabProfileDialog(Api(server), "org-1", "user-1");
        dialog.Show();
        await dialog.LoadAsync();
        Assert.Equal("Sunrise", dialog.FindControl<TextBox>("NameBox")!.Text);
        Assert.True(dialog.FindControl<StackPanel>("Form")!.IsVisible);

        await dialog.ChooseLogoAsync("logo.gif", () => Task.FromResult<Stream>(new MemoryStream([1, 2, 3])));
        Assert.Contains("JPG, PNG", dialog.FindControl<TextBlock>("LogoText")!.Text);

        server.Calls.Clear();
        dialog.FindControl<TextBox>("PhoneBox")!.Text = "9000000000";
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        var call = Assert.Single(server.Calls);
        Assert.Contains("/rest/v1/organizations?id=eq.org-1", call.Url);
        Assert.Contains("\"primary_phone\":\"9000000000\"", call.Body);
    }

    [AvaloniaFact]
    public async Task APackageShowsItsPriceAsTestsAreTickedAndSavesThePackageAndItsTests()
    {
        var server = new Server(HttpStatusCode.Created, "[]");
        var catalog = new Catalog([new CatalogTest("t1", "CBC", "CBC", 300m, null), new CatalogTest("t2", "LFT", "Liver Function Test", 450m, null)], [], [], [], []);
        var dialog = new PackageDialog(Api(server), "org-1", catalog, null, null);
        dialog.Show();
        var list = dialog.FindControl<ListBox>("TestList")!;
        list.SelectedItems!.Add(catalog.Tests[0]);
        list.SelectedItems.Add(catalog.Tests[1]);
        dialog.FindControl<TextBox>("DiscountBox")!.Text = "10";
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Contains("package price ₹675", dialog.FindControl<TextBlock>("PriceText")!.Text);
        Assert.Contains("2 test(s) chosen", dialog.FindControl<TextBlock>("PriceText")!.Text);

        dialog.FindControl<TextBox>("NameBox")!.Text = "Basic health";
        await Click(dialog, "SaveButton");
        Assert.True(dialog.Saved);
        Assert.Equal(2, server.Calls.Count);
        Assert.Contains("/rest/v1/test_packages", server.Calls[0].Url);
        Assert.Contains("\"price\":675", server.Calls[0].Body);
        Assert.Contains("/rest/v1/test_package_tests", server.Calls[1].Url);
    }

    [AvaloniaFact]
    public void ThePackageAndDoctorTabsOfferTheirOwnButtonsToAdminsOnly()
    {
        var path = Path.Combine(Path.GetTempPath(), $"labshope-cat-{Guid.NewGuid():N}.db");
        var store = new LocalStore(path);
        try
        {
            var api = Api(new Server(HttpStatusCode.OK, "[]"));
            var session = new AppSession(new LabShope.Core.Account.Workspace("demo", "org-1", "Demo Lab", "l1", ["admin"]), store,
                new LabShope.Core.Sync.SyncRunner(new LabShope.Core.Sync.SyncEngine(store, api, "org-1"), store), new LabShope.Core.Account.AccountService(api, path + ".json"), api);
            var catalog = new CatalogView(session);
            new Window { Content = catalog }.Show();

            Assert.False(catalog.FindControl<Button>("DeleteButton")!.IsVisible); // tests are switched off, not deleted
            catalog.FindControl<Button>("PackagesButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal("New package", catalog.FindControl<TextBlock>("NewText")!.Text);
            Assert.True(catalog.FindControl<Button>("DeleteButton")!.IsVisible);
            catalog.FindControl<Button>("DoctorsButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal("Edit doctor", catalog.FindControl<TextBlock>("EditText")!.Text);
            catalog.FindControl<Button>("LabsButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal("New external lab", catalog.FindControl<TextBlock>("NewText")!.Text);
            Assert.Equal("Switch off", catalog.FindControl<TextBlock>("DeleteText")!.Text);
            catalog.FindControl<Button>("CategoriesButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal("New category", catalog.FindControl<TextBlock>("NewText")!.Text);
            Assert.False(catalog.FindControl<Button>("EditButton")!.IsVisible); // the website only adds categories
            Assert.False(catalog.FindControl<Button>("DeleteButton")!.IsVisible);
            catalog.FindControl<Button>("TemplatesButton")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert.Equal("New report template", catalog.FindControl<TextBlock>("NewText")!.Text);
            Assert.True(catalog.FindControl<Button>("DeleteButton")!.IsVisible);
        }
        finally { store.Dispose(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); }
    }

    [AvaloniaFact]
    public void TheEyeShowsAndHidesThePasswordWhileTyping()
    {
        var dialog = new StaffDialog(Api(new Server(HttpStatusCode.OK, "{}")), "org-1", [new LabRef("l1", "Main Lab", "ML")], "l1");
        dialog.Show();
        var box = dialog.FindControl<TextBox>("PasswordBox")!;
        var eye = dialog.FindControl<Avalonia.Controls.Primitives.ToggleButton>("PasswordEye")!;
        box.Text = "longenough1";

        Assert.False(box.RevealPassword); // hidden to begin with
        eye.IsChecked = true;
        eye.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Assert.True(box.RevealPassword);
        Assert.Equal("longenough1", box.Text); // the typed text is untouched

        eye.IsChecked = false;
        eye.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Assert.False(box.RevealPassword);
    }
}
