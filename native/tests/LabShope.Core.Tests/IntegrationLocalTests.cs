using System.Text.Json;
using LabShope.Core.Data;
using LabShope.Core.Net;
using LabShope.Core.Sync;
using LabShope.Core.Visits;
using LabShope.Core;

namespace LabShope.Core.Tests;

/// <summary>
/// End-to-end check against a real local Supabase (real auth, RLS, register_visit). Skipped unless
/// LIMS_IT_URL, LIMS_IT_ANON_KEY, LIMS_IT_EMAIL, LIMS_IT_PASSWORD, LIMS_IT_ORG and LIMS_IT_LAB are set;
/// scripts/test-db.sh sets them up.
/// </summary>
public class IntegrationLocalTests
{
    private static string? Env(string name) => Environment.GetEnvironmentVariable(name);

    [SkippableFact]
    public async Task SignsInRegistersAVisitAndPullsItBack()
    {
        Skip.If(Env("LIMS_IT_URL") is null, "no local database configured");

        var org = Env("LIMS_IT_ORG")!;
        var path = Path.Combine(Path.GetTempPath(), $"labshope-it-{Guid.NewGuid():N}.db");
        using var store = new LocalStore(path);
        var api = new SupabaseApi(new HttpClient(), Env("LIMS_IT_URL")!, Env("LIMS_IT_ANON_KEY")!);

        var (session, signIn) = await api.SignInAsync(Env("LIMS_IT_EMAIL")!, Env("LIMS_IT_PASSWORD")!);
        Assert.True(signIn.Ok, signIn.ErrorMessage);
        Assert.NotNull(session);

        // Register a visit with part payment, exactly as the counter screen does (no network involved yet).
        var phone = $"9{Random.Shared.Next(100000000, 999999999)}";
        var visits = new VisitService(store);
        var visit = visits.Register(new RegisterVisitInput(
            org, Env("LIMS_IT_LAB"), DateTime.UtcNow.ToString("yyyy-MM-dd"),
            [new VisitTest("CBC", 300), new VisitTest("LFT", 450)],
            NewPatient: new NewPatient("Native Integration Patient", phone),
            Payment: new InitialPayment(300m, "upi", "UPI-IT")));
        Assert.Equal(750m, visit.Total);
        Assert.StartsWith("L-", store.GetInvoice(visit.VisitId)!.InvoiceNumber);

        // Send: the visit first, then its payment.
        var engine = new SyncEngine(store, api, org);
        var outcome = await engine.FlushOutboxAsync();
        Assert.Equal(new FlushOutcome(2, 0, null), outcome);
        Assert.Equal((0, 0), store.OutboxCounts());

        // The bill now has the server's number and shows the part payment.
        var bill = store.GetInvoice(visit.VisitId)!;
        Assert.DoesNotContain("L-", bill.InvoiceNumber);
        Assert.Equal(("partial", 300m), (bill.PaymentStatus, bill.PaidAmount));

        // Pull everything back: the server agrees, and a scan of the patient card finds them.
        await engine.PullPatientsAsync();
        await engine.PullInvoicesAsync();
        var fromServer = store.GetInvoice(visit.VisitId)!;
        Assert.Equal(("partial", 300m), (fromServer.PaymentStatus, fromServer.PaidAmount));
        var patientCode = store.SearchPatients("Native Integration").First().PatientCode;
        Assert.IsType<ScanMatch.FoundPatient>(store.ResolveScan(patientCode));

        // Settle the rest, send it, and the bill is paid on the server too.
        new PaymentService(store, org).Record(new PaymentInput(visit.VisitId, 450m, "cash"));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        await engine.PullInvoicesAsync();
        Assert.Equal(("paid", 750m), (store.GetInvoice(visit.VisitId)!.PaymentStatus, store.GetInvoice(visit.VisitId)!.PaidAmount));

        // The test ids the app chose are the ones the server stored, so a result entered on this PC lands on the right row.
        await engine.PullCatalogAsync(force: true);
        await engine.PullPatientTestsAsync();
        var worklist = store.SearchWorklist("", ["pending"]);
        var cbcRows = worklist.Where(r => r.TestName == "CBC" && r.PatientName == "Native Integration Patient").ToList();
        Assert.True(cbcRows.Count == 1, "CBC rows: " + string.Join(" | ", worklist.Select(r => $"{r.TestName}/{r.Id}/{r.PatientName}")));
        var cbc = cbcRows[0];
        var serverRow = await api.SelectAsync("patient_tests", $"select=id,status&id=eq.{cbc.Id}");
        Assert.Equal(1, serverRow.Body!.Value.GetArrayLength());

        var results = new ResultService(store, org, session!.UserId);
        results.Enter(cbc.Id, "12.5", "g/dL");
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());

        var after = await api.SelectAsync("patient_tests", $"select=status,result_value,result_unit,is_abnormal,result_entered_by&id=eq.{cbc.Id}");
        var row = after.Body!.Value[0];
        Assert.Equal("completed", row.GetProperty("status").GetString());
        Assert.Equal(12.5m, row.GetProperty("result_value").GetDecimal());
        Assert.Equal("g/dL", row.GetProperty("result_unit").GetString());
        Assert.Equal(session.UserId, row.GetProperty("result_entered_by").GetString());

        // Entering a result for a test that isn't ours is refused by the server, not silently dropped.
        var stranger = await api.PatchAsync("patient_tests", $"id=eq.{Guid.NewGuid()}&organization_id=eq.{org}", new { status = "completed" });
        Assert.True(stranger.Ok);
        Assert.Equal(0, stranger.Body!.Value.GetArrayLength());

        // Editing a synced patient on this PC updates the real patients row.
        var synced = store.SearchPatients("Native Integration").First();
        new PatientService(store, org).Edit(synced.Id, new PatientEdit("Native Integration Patient Edited", synced.Phone, "female", "1991-02-03"));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var patientRow = (await api.SelectAsync("patients", $"select=full_name,gender,date_of_birth&id=eq.{synced.Id}")).Body!.Value[0];
        Assert.Equal(("Native Integration Patient Edited", "female", "1991-02-03"),
            (patientRow.GetProperty("full_name").GetString(), patientRow.GetProperty("gender").GetString(), patientRow.GetProperty("date_of_birth").GetString()));

        // The lab's branding comes from the same public lookup the website uses.
        Assert.True(await engine.PullBrandingAsync("it-org", "fallback", force: true));
        Assert.Equal("IT Org", store.GetBranding("fallback").Name);

        // A manager can change a test's price and range on the server, and it reaches this PC with the next catalog pull.
        var change = await CatalogAdmin.UpdateTestAsync(api, org, cbc.Id.Length > 0 ? store.GetCatalog().Tests.First(t => t.Name == "CBC").Id : "", new TestEdit("325", "x10^9/L", "4", "11", "", true));
        Assert.True(change.Ok, change.Error);
        await engine.PullCatalogAsync(force: true);
        var cbcTest = store.GetCatalog().Tests.Single(t => t.Name == "CBC");
        Assert.Equal((325m, "x10^9/L", 4m, 11m), (cbcTest.Price, cbcTest.Unit, cbcTest.NormalMin, cbcTest.NormalMax));

        // A booking made on the website reaches this PC; working it here updates the real row.
        await engine.PullBookingsAsync();
        var booking = store.SearchBookings("web booker").Single();
        Assert.Equal("new", booking.Status);
        new BookingService(store, org, session.UserId).MarkConverted(booking.Id, synced.Id);
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var bookingRow = (await api.SelectAsync("booking_requests", $"select=status,patient_id,converted_by&id=eq.{booking.Id}")).Body!.Value[0];
        Assert.Equal(("converted", synced.Id, session.UserId), (bookingRow.GetProperty("status").GetString(), bookingRow.GetProperty("patient_id").GetString(), bookingRow.GetProperty("converted_by").GetString()));

        // The team list comes from the real employees table.
        var team = await TeamService.LoadAsync(api, org);
        Assert.Null(team.Error);
        Assert.Contains(team.Members, m => m.FullName == "IT Admin" && m.IsActive);

        // An admin can add a test to the catalog and switch staff off and on (row level security allows it).
        var added = await CatalogAdmin.AddTestAsync(api, org, new CatalogAdmin.NewTest("Integration Panel", "123", null, "", "", "", "", ""), ["IP001"]);
        Assert.True(added.Ok, added.Error);
        var newRow = (await api.SelectAsync("tests", $"select=test_id,price,is_active&organization_id=eq.{org}&name=eq.Integration%20Panel")).Body!.Value[0];
        Assert.Equal(("IP002", 123m, true), (newRow.GetProperty("test_id").GetString(), newRow.GetProperty("price").GetDecimal(), newRow.GetProperty("is_active").GetBoolean()));
        var me = team.Members.Single(m => m.FullName == "IT Admin");
        Assert.True((await TeamService.SetActiveAsync(api, org, me.Id, false)).Ok);
        Assert.False((await TeamService.LoadAsync(api, org)).Members.Single(m => m.Id == me.Id).IsActive);
        Assert.True((await TeamService.SetActiveAsync(api, org, me.Id, true)).Ok);
        Assert.True((await TeamService.LoadAsync(api, org)).Members.Single(m => m.Id == me.Id).IsActive);

        // A patient can be added on their own, switched off (hidden and listed as switched off) and switched on again.
        var alone = await PatientAdmin.AddAsync(api, store, org, Env("LIMS_IT_LAB"), session.UserId, new StandalonePatient("Solo Patient", "9000011122", "female", "1988-03-04", "solo@example.com", "1 Test Road", "B+"));
        Assert.True(alone.Ok, alone.Error);
        var soloRow = (await api.SelectAsync("patients", $"select=patient_id,full_name,blood_group,is_active,created_by&id=eq.{alone.Patient!.Id}")).Body!.Value[0];
        Assert.Equal((alone.Patient.PatientCode, "Solo Patient", "B+", true, session.UserId),
            (soloRow.GetProperty("patient_id").GetString(), soloRow.GetProperty("full_name").GetString(), soloRow.GetProperty("blood_group").GetString(), soloRow.GetProperty("is_active").GetBoolean(), soloRow.GetProperty("created_by").GetString()));
        Assert.True((await PatientAdmin.SetActiveAsync(api, store, org, alone.Patient, active: false)).Ok);
        Assert.Null(store.GetPatient(alone.Patient.Id));
        var (switchedOff, offError) = await PatientAdmin.LoadInactiveAsync(api, org);
        Assert.Null(offError);
        Assert.Contains(switchedOff, p => p.Id == alone.Patient.Id);
        Assert.True((await PatientAdmin.SetActiveAsync(api, store, org, switchedOff.Single(p => p.Id == alone.Patient.Id), active: true)).Ok);
        Assert.NotNull(store.GetPatient(alone.Patient.Id));

        // An admin can manage doctors and packages the way the website does.
        Assert.True((await CatalogManage.AddDoctorAsync(api, org, new DoctorInput("Dr Integration", "Pathology", "9000099999", "", "", "7.5", true, ""))).Ok);
        var doctorRow = (await api.SelectAsync("doctors", $"select=id,commission_percentage,is_active&organization_id=eq.{org}&name=eq.Dr%20Integration")).Body!.Value[0];
        var doctorId = doctorRow.GetProperty("id").GetString()!;
        Assert.Equal(7.5m, doctorRow.GetProperty("commission_percentage").GetDecimal());
        var (loadedDoctor, doctorLoadError) = await CatalogManage.LoadDoctorAsync(api, org, doctorId);
        Assert.Null(doctorLoadError);
        Assert.True((await CatalogManage.UpdateDoctorAsync(api, org, doctorId, loadedDoctor!.Input with { Commission = "9", Active = false })).Ok);
        var doctorAfter = (await api.SelectAsync("doctors", $"select=commission_percentage,is_active&id=eq.{doctorId}")).Body!.Value[0];
        Assert.Equal((9m, false), (doctorAfter.GetProperty("commission_percentage").GetDecimal(), doctorAfter.GetProperty("is_active").GetBoolean()));
        Assert.True((await CatalogManage.DeleteDoctorAsync(api, org, doctorId)).Ok);

        await engine.PullCatalogAsync(force: true);
        var pkgCatalog = store.GetCatalog();
        var pkgTests = pkgCatalog.Tests.Take(2).Select(t => t.Id).ToList();
        Assert.True((await CatalogManage.AddPackageAsync(api, org, new PackageInput("Integration Package", "d", "10", pkgTests, true), pkgCatalog)).Ok);
        var pkgRow = (await api.SelectAsync("test_packages", $"select=id,price,discount_percentage&organization_id=eq.{org}&name=eq.Integration%20Package")).Body!.Value[0];
        var pkgId = pkgRow.GetProperty("id").GetString()!;
        Assert.Equal(CatalogManage.PackagePrice(pkgCatalog.Tests.Take(2).Select(t => t.Price), 10m), pkgRow.GetProperty("price").GetDecimal());
        Assert.Equal(2, (await api.SelectAsync("test_package_tests", $"select=test_id&package_id=eq.{pkgId}")).Body!.Value.GetArrayLength());
        Assert.True((await CatalogManage.UpdatePackageAsync(api, org, pkgId, new PackageInput("Integration Package", "d", "0", pkgTests.Take(1).ToList(), true), pkgCatalog)).Ok);
        Assert.Equal(1, (await api.SelectAsync("test_package_tests", $"select=test_id&package_id=eq.{pkgId}")).Body!.Value.GetArrayLength());
        Assert.True((await CatalogManage.DeletePackageAsync(api, org, pkgId)).Ok);
        Assert.Equal(0, (await api.SelectAsync("test_packages", $"select=id&id=eq.{pkgId}")).Body!.Value.GetArrayLength());

        // External labs and test categories can be added and an external lab switched off, as on the website.
        Assert.True((await CatalogManage.AddExternalLabAsync(api, org, new ExternalLabInput("Integration Ext Lab", "IEL", "Ms Test", "9000088888", "", "", "", ""))).Ok);
        var extRow = (await api.SelectAsync("external_labs", $"select=id,code,contact_person&organization_id=eq.{org}&name=eq.Integration%20Ext%20Lab")).Body!.Value[0];
        var extId = extRow.GetProperty("id").GetString()!;
        Assert.Equal(("IEL", "Ms Test"), (extRow.GetProperty("code").GetString(), extRow.GetProperty("contact_person").GetString()));
        Assert.True((await CatalogManage.UpdateExternalLabAsync(api, org, extId, new ExternalLabInput("Integration Ext Lab", "IEL2", "", "", "", "", "", ""))).Ok);
        Assert.True((await CatalogManage.SetExternalLabActiveAsync(api, org, extId, false)).Ok);
        var extAfter = (await api.SelectAsync("external_labs", $"select=code,is_active&id=eq.{extId}")).Body!.Value[0];
        Assert.Equal(("IEL2", false), (extAfter.GetProperty("code").GetString(), extAfter.GetProperty("is_active").GetBoolean()));
        Assert.True((await CatalogManage.AddCategoryAsync(api, org, "Integration Category", "d", [])).Ok);
        Assert.Equal(1, (await api.SelectAsync("test_categories", $"select=id&organization_id=eq.{org}&name=eq.Integration%20Category")).Body!.Value.GetArrayLength());

        // An admin can add, edit and delete a lab and a collection centre.
        Assert.True((await OrgAdmin.AddLabAsync(api, org, new LabInput("itlab", "Integration Branch", "branch", Env("LIMS_IT_LAB"), "", "Pune", "", "", "", "", true, "18.5", "73.8", false, ""))).Ok);
        var newLabRow = (await api.SelectAsync("labs", $"select=id,lab_code,parent_lab_id&organization_id=eq.{org}&name=eq.Integration%20Branch")).Body!.Value[0];
        var newLabId = newLabRow.GetProperty("id").GetString()!;
        Assert.Equal(("ITLAB", Env("LIMS_IT_LAB")), (newLabRow.GetProperty("lab_code").GetString(), newLabRow.GetProperty("parent_lab_id").GetString()));
        var (loadedLab, labLoadError) = await OrgAdmin.LoadLabAsync(api, org, newLabId);
        Assert.Null(labLoadError);
        Assert.Equal("18.5", loadedLab!.Input.Latitude);
        Assert.True((await OrgAdmin.UpdateLabAsync(api, org, loadedLab, loadedLab.Input with { City = "Mumbai" })).Ok);
        Assert.True((await OrgAdmin.AddCenterAsync(api, org, new CenterInput(newLabId, "itc", "Integration Centre", "", "", "", "", true))).Ok);
        var centerRow = (await api.SelectAsync("collection_centers", $"select=id,code&organization_id=eq.{org}&lab_id=eq.{newLabId}")).Body!.Value[0];
        var centerId = centerRow.GetProperty("id").GetString()!;
        Assert.Equal("ITC", centerRow.GetProperty("code").GetString());
        Assert.True((await OrgAdmin.UpdateCenterAsync(api, org, centerId, new CenterInput(newLabId, "ITC", "Integration Centre 2", "", "", "", "", false))).Ok);
        Assert.True((await OrgAdmin.DeleteCenterAsync(api, org, centerId)).Ok);
        Assert.True((await OrgAdmin.DeleteLabAsync(api, org, newLabId)).Ok);

        // An admin can edit a person's details (name, designation, department).
        Assert.True((await TeamService.UpdateAsync(api, org, me.Id, new TeamService.StaffEdit("IT Admin", "", "Chief tester", "QA"))).Ok);
        var meRow = (await api.SelectAsync("employees", $"select=designation,department&id=eq.{me.Id}")).Body!.Value[0];
        Assert.Equal(("Chief tester", "QA"), (meRow.GetProperty("designation").GetString(), meRow.GetProperty("department").GetString()));

        // An admin can add, edit and delete the lab's own report template.
        Assert.True((await TemplateAdmin.AddAsync(api, org, new TemplateInput("Integration template", null, null, "<h1>{lab_name}</h1>", "", "table", true, true, true, "", false))).Ok);
        var tplRow = (await api.SelectAsync("test_templates", $"select=id,result_format&organization_id=eq.{org}&name=eq.Integration%20template")).Body!.Value[0];
        var tplId = tplRow.GetProperty("id").GetString()!;
        Assert.True((await TemplateAdmin.UpdateAsync(api, org, tplId, new TemplateInput("Integration template", null, null, "<h1>{lab_name}</h1>", "bye", "list", true, false, true, "p{margin:0}", false))).Ok);
        var tplAfter = (await api.SelectAsync("test_templates", $"select=result_format,footer_template,custom_css&id=eq.{tplId}")).Body!.Value[0];
        Assert.Equal(("list", "bye", "p{margin:0}"), (tplAfter.GetProperty("result_format").GetString(), tplAfter.GetProperty("footer_template").GetString(), tplAfter.GetProperty("custom_css").GetString()));
        Assert.Equal("p{margin:0}", await TemplateAdmin.LoadCssAsync(api, org, tplId));
        Assert.True((await TemplateAdmin.DeleteAsync(api, org, tplId)).Ok);

        // The subscription details can be read by staff (row level security) and cached.
        Assert.True(await SubscriptionService.RefreshAsync(api, store, org, force: true));
        Assert.NotNull(SubscriptionService.Cached(store));

        // Inventory: stock used and bought move the real stock level and are logged.
        var stock = await InventoryService.LoadAsync(api, org);
        Assert.Null(stock.Error);
        var reagent = stock.Items.Single(i => i.Name == "IT Reagent");
        Assert.Equal(50m, reagent.CurrentStock);
        Assert.True((await InventoryService.RecordUsageAsync(api, org, session.UserId, reagent, "5", "integration run")).Ok);
        Assert.Equal(45m, (await InventoryService.LoadAsync(api, org)).Items.Single(i => i.Name == "IT Reagent").CurrentStock);
        Assert.True((await InventoryService.RecordPurchaseAsync(api, org, session.UserId, reagent, "20", "4", "Supplier")).Ok);
        Assert.Equal(65m, (await InventoryService.LoadAsync(api, org)).Items.Single(i => i.Name == "IT Reagent").CurrentStock);
        var tooMuch = reagent with { CurrentStock = 65m };
        Assert.False((await InventoryService.RecordUsageAsync(api, org, session.UserId, tooMuch, "999", null)).Ok); // more than is in stock is refused

        // Sending a test to an external lab updates the real row and the books follow (Dr Outsourcing Expense / Cr Outsource Payable).
        await engine.PullCatalogAsync(force: true);
        Assert.Contains(store.GetCatalog().ExternalLabList, l => l.Name == "IT External Lab");
        var lft = store.SearchWorklist("", ["pending"]).Single(r => r.TestName == "LFT" && r.PatientName.StartsWith("Native Integration Patient"));
        new ResultService(store, org, session.UserId).Outsource(lft.Id, "99999999-0000-0000-0000-0000000000e1", "180");
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var lftRow = (await api.SelectAsync("patient_tests", $"select=external_lab_id,outsource_cost,outsource_journal_entry_id&id=eq.{lft.Id}")).Body!.Value[0];
        Assert.Equal(("99999999-0000-0000-0000-0000000000e1", 180m), (lftRow.GetProperty("external_lab_id").GetString(), lftRow.GetProperty("outsource_cost").GetDecimal()));
        Assert.NotEqual(System.Text.Json.JsonValueKind.Null, lftRow.GetProperty("outsource_journal_entry_id").ValueKind); // the books were posted

        // A discounted bill: what is owed is final_amount, so paying exactly that settles it on the server too.
        var second = new VisitService(store).Register(new RegisterVisitInput(org, Env("LIMS_IT_LAB"), DateTime.UtcNow.ToString("yyyy-MM-dd"),
            [new VisitTest("CBC", 300), new VisitTest("LFT", 450)], NewPatient: new NewPatient("Discount Patient", $"9{Random.Shared.Next(100000000, 999999999)}")));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var discounted = await api.PatchAsync("invoices", $"id=eq.{second.VisitId}&organization_id=eq.{org}", new { discount_amount = 100, final_amount = 650 });
        Assert.True(discounted.Ok, discounted.ErrorMessage);
        await engine.PullInvoicesAsync();
        var owed = store.GetInvoice(second.VisitId)!;
        Assert.Equal((650m, 100m), (owed.TotalAmount, owed.Discount));
        new PaymentService(store, org).Record(new PaymentInput(second.VisitId, 650m, "cash"));
        Assert.Equal(new FlushOutcome(1, 0, null), await engine.FlushOutboxAsync());
        var settled = (await api.SelectAsync("invoices", $"select=payment_status,paid_amount,final_amount&id=eq.{second.VisitId}")).Body!.Value[0];
        Assert.Equal(("paid", 650m), (settled.GetProperty("payment_status").GetString(), settled.GetProperty("paid_amount").GetDecimal()));

        // Payments taken anywhere reach this PC: a fresh PC pulling from the real server sees them, with the payment of this test among them.
        var freshPath = Path.Combine(Path.GetTempPath(), $"labshope-it2-{Guid.NewGuid():N}.db");
        using (var fresh = new LocalStore(freshPath))
        {
            await new SyncEngine(fresh, api, org).PullPaymentsAsync();
            var seen = fresh.PaymentsFor(visit.VisitId);
            Assert.Equal(2, seen.Count); // the 300 and the 450 paid earlier in this test
            Assert.Equal(750m, seen.Sum(p => p.Amount));
            Assert.All(seen, p => Assert.True(p.Synced));
        }
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(freshPath);

        // The books: everything above (bills and payments) was posted automatically, and the Finance screen sees it balanced.
        var books = await Finance.FinanceService.LoadAsync(api, org, new DateOnly(2020, 4, 1), new DateOnly(2100, 3, 31));
        Assert.Null(books.Error);
        Assert.True(books.Data!.Tallied, $"books out of balance: {books.Data.TotalDebit} vs {books.Data.TotalCredit}");
        Assert.True(books.Data.EntryCount >= 3, "bill and payments should have posted entries");
        var cashAccount = books.Data.Accounts.Single(a => a.Code == "1001");
        Assert.True(cashAccount.TotalDebit >= 750m, $"cash debited {cashAccount.TotalDebit}"); // this test's 300 + 450 payments (plus other tests')
        Assert.True(books.Data.Accounts.Single(a => a.Code == "5009").TotalDebit >= 180m); // the outsourcing expense, and it still balances above

        // The server refuses to be paid twice for the same thing: replaying the same payment changes nothing.
        var payment = store.PaymentsFor(visit.VisitId).First();
        var replay = await api.RpcAsync("record_payment", new { p_payload = new { payment_id = payment.Id, invoice_id = visit.VisitId, organization_id = org, amount = payment.Amount, payment_method = payment.Method } });
        Assert.True(replay.Ok, replay.ErrorMessage);
        Assert.True(replay.Body!.Value.GetProperty("replayed").GetBoolean());

        // The bill's details as the website shows them: items, payments with who took them, and the history the server kept.
        var details = await BillingAdmin.LoadAsync(api, org, visit.VisitId);
        Assert.Null(details.Error);
        Assert.Equal(["CBC", "LFT"], details.Items.Select(i => i.TestName).OrderBy(n => n));
        Assert.Equal(750m, details.Payments.Sum(p => p.Amount));
        Assert.Contains(details.History, h => h.Action == "invoice_created");
        Assert.Contains(details.History, h => h.Action == "payment_recorded" && h.Summary.StartsWith("300"));

        // Editing the bill as an admin (a price and a discount): the server stores it and the status follows what was paid.
        var cbcItem = details.Items.Single(i => i.TestName == "CBC");
        var lftItem = details.Items.Single(i => i.TestName == "LFT");
        var edit = await BillingAdmin.EditAsync(api, org, session.UserId, true, store.GetInvoice(visit.VisitId)!,
            [new(cbcItem.Id, 250m, cbcItem.Quantity), new(lftItem.Id, lftItem.UnitPrice, lftItem.Quantity)], 50m);
        Assert.True(edit.Ok, edit.Error);
        var edited = (await api.SelectAsync("invoices", $"select=total_amount,discount_amount,final_amount,payment_status,discount_entered_by&id=eq.{visit.VisitId}")).Body!.Value[0];
        Assert.Equal((700m, 50m, 650m, "paid"), (edited.GetProperty("total_amount").GetDecimal(), edited.GetProperty("discount_amount").GetDecimal(),
            edited.GetProperty("final_amount").GetDecimal(), edited.GetProperty("payment_status").GetString())); // 750 was paid: nothing left to pay
        Assert.Equal(session.UserId, edited.GetProperty("discount_entered_by").GetString());
        var reloaded = await BillingAdmin.LoadAsync(api, org, visit.VisitId);
        Assert.Equal(250m, reloaded.Items.Single(i => i.TestName == "CBC").UnitPrice);
        Assert.Contains(reloaded.History, h => h.Action is "discount_updated" or "invoice_updated");

        // A discount given at the counter: the server stores it the way the website does, the patient owes the discountVisit amount,
        // and the books (which post from the final amount) still balance.
        var discountVisit = new VisitService(store).Register(new RegisterVisitInput(org, Env("LIMS_IT_LAB"), DateTime.UtcNow.ToString("yyyy-MM-dd"),
            [new VisitTest("CBC", 300), new VisitTest("LFT", 450)], NewPatient: new NewPatient("Discount Integration Patient", $"9{Random.Shared.Next(100000000, 999999999)}"),
            Discount: 150m, Payment: new InitialPayment(600m, "cash")));
        Assert.Equal(600m, discountVisit.Total);
        var discountFlush = await engine.FlushOutboxAsync();
        Assert.True(discountFlush == new FlushOutcome(2, 0, null), "discount visit: " + string.Join(" | ", store.ListOutbox().Select(o => $"{o.What}/{o.Badge}/{o.Detail}")));
        var discountRow = (await api.SelectAsync("invoices", $"select=total_amount,discount_amount,final_amount,payment_status,discount_entered_by&id=eq.{discountVisit.VisitId}")).Body!.Value[0];
        Assert.Equal((750m, 150m, 600m, "paid"), (discountRow.GetProperty("total_amount").GetDecimal(), discountRow.GetProperty("discount_amount").GetDecimal(),
            discountRow.GetProperty("final_amount").GetDecimal(), discountRow.GetProperty("payment_status").GetString()));
        Assert.Equal(session.UserId, discountRow.GetProperty("discount_entered_by").GetString());
        await engine.PullInvoicesAsync();
        var pulled = store.GetInvoice(discountVisit.VisitId)!;
        Assert.Equal((600m, 150m, "paid"), (pulled.TotalAmount, pulled.Discount, pulled.PaymentStatus)); // the server agrees with what the PC showed
        var booksAfter = await Finance.FinanceService.LoadAsync(api, org, new DateOnly(2020, 4, 1), new DateOnly(2100, 3, 31));
        Assert.True(booksAfter.Data!.Tallied, "the books still balance after a discountVisit bill");

        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(path);
    }
}
