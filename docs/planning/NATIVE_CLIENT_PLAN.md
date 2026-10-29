# Native desktop client (decided 2026-10-29)

Goal: desktop software that feels like LabMaster (classic Windows-style lab software), fast on big
lists, works offline, and talks to barcode scanners and lab analyzers. Replaces the Electron wrapper
(`desktop/`) as the way labs run LabShope on a PC. The web app stays for browsers and the patient portal.

## Stack
- .NET 10 + Avalonia (native-feeling UI on macOS, Windows, Ubuntu), `native/`
- `LabShope.Core`: models, local SQLite store, scan detector, (next) sync, analyzer protocols
- `LabShope.App`: menu bar, toolbar, tabbed windows, status bar, F-key shortcuts
- Local SQLite per organisation; same offline-first rules as the web app (outbox, idempotent visit id)

## Done
- Solution, CI job `native`, 13 tests (scan detector, local store, scan lookup)
- Shell: menu, toolbar, tabs, status bar, Patient Register grid reading local data, scan from anywhere

## Next (in order)
1. Match LabMaster's screens exactly. Needs screenshots of: main window, registration, billing, result entry, report.
2. Login. The staff login function requires a Cloudflare Turnstile token, which a native app can't produce.
   Needs a server-side decision (e.g. a desktop sign-in path, or direct Supabase password auth + device registration).
3. Sync: pull catalog/patients/invoices into SQLite, send visits via the `register_visit` RPC from an outbox.
4. Registration + billing screens, then result entry, reports/printing (silent print, labels).
5. Analyzer listener (serial + TCP, ASTM/HL7), starting with the most-used machine. Needs the model list.
6. Installers: .dmg, .msi/.exe, .deb via GitHub release workflow; auto-update.

## Update: sync core done (tests: 19 fake-server + 1 real-database)
- `SupabaseApi`: password sign-in, token refresh (one retry on expiry), PostgREST select, RPC. No SDK.
- `SyncEngine`: keyset pulls for patients and bills, visit outbox through `register_visit`, same error rules as the web app.
- Login decision taken: the native app signs in directly with Supabase email + password (no Turnstile, which only a browser can
  produce). Still to add: device registration / org check at sign-in, and 2FA if the lab has it on.

## Requirement (from the owner): works fully without internet
The internet is only for syncing, so patients can download their reports on their own. Everything staff do at the
bench (register, bill, take payment, enter results, print reports/labels, scan, analyzers) must work with no connection,
and the app must open straight to work (saved login, no sign-in each time, no waiting on the network).
Consequences to build, in order:
1. Offline invoice/receipt numbers (each PC leases a block of numbers; no clashes after sync).
2. Offline result entry and approval, queued like visits.
3. Offline payments, queued.
4. Report PDFs generated on the PC; on sync, finished reports are published so the patient portal can serve them.
5. Sync is background-only and never blocks a screen.
Already true: opens from the saved login offline, all screens read local SQLite, visits queue offline.

## Update: login + live data wired into the window
Login window, saved-login restore (offline-safe), sync every 60 s + on open, Patients and Bills grids on real local data,
sidebar-style menu mirroring the web app's Work / Catalog / Manage groups (only Patients and Bills enabled so far).

## Update: sign-in is email + password only
Customers sign up on the website, then download the app. They never need a lab name: after sign-in the app finds the lab from the
account, using the same rules as the web login (staff role, active employee record, active membership, active/trial subscription).
Employees created by an admin use the email + password they were given and land in their own lab. Owners/platform admins with several
labs get a short list to pick from. The first sign-in on a computer needs internet; after that the app opens offline from the saved login.
Known gap: accounts with email two-step verification are refused with a clear message until the desktop app supports it.
Also built (no screen yet): phone normalisation, catalog storage, `VisitService` (register a visit locally, queue it, instant, offline).

## Update: Register visit screen (milestone 1, step 1)
Catalog sync (tests, packages, doctors, labs, centers; every 10 min, never wipes a good copy) and the Register Visit screen:
existing patient search or new patient, test search + packages, referring doctor, collection centre, running total, Save (F8).
Saves locally and instantly; sent to the server by the outbox. Barcode scan of a patient card picks the patient.
UI is tested headless (`native/tests/LabShope.App.Tests`, Avalonia.Headless): type, add tests, delete, package price, save -> queued.
Next in milestone 1: payments + receipts, bill detail/print, offline invoice numbers, patient edit, labels.

## Update: payments, receipts, cash book, and the accounting link (milestone 1)
- New server function `record_payment` (migration 20261029000400): atomic + idempotent payment on a bill. Inserting the payment fires the
  existing finance trigger (Dr Cash / Cr Receivable) and billing audit; creating the bill already posts Dr Receivable / Cr Revenue.
  `supabase/tests/record_payment.test.sql` proves it: part/full payment, replay, overpayment refused, and the books balance (1500 = 1500).
  **The migration must be applied on production before payments from the native app can sync** (until then they stay queued, safely).
- Native: payment taken on this PC instantly (bill shows paid), queued after its visit, sent via `record_payment`; a payment the server
  refuses is taken back off the bill. Provisional bill numbers `L-yymmdd-0001` until the server issues the official `INV…` number.
- Screens: payment fields on Register visit, Bills (search, balance, Receive payment F6, Print receipt), Daily cash book (F7).
- Receipts are printable HTML opened in the system browser (any printer, thermal included). Silent printing and PDF come later.
- Not yet native: a Finance screen (accounts, journal, trial balance). Everything posts to the books automatically on the server.

## Update: result entry (milestone 2, step 1)
- Worklist: ordered tests (patient_tests) are pulled to the PC (30 days, then changes). A visit registered on the PC puts its tests on the
  worklist at once; the visit carries each test's id (migration 20261029000500 lets register_visit accept client-chosen test ids), so a result
  entered offline lands on the right row once the visit is sent.
- Entering a result updates the row locally (status completed) and queues a PATCH of that patient_tests row, as the website does
  (result_value / result text, unit, is_abnormal from the numeric range, normal_range_text, result_entered_by/at, updated_by).
  A PATCH that matches no row is treated as refused and the test goes back on the worklist. Newer server data never overwrites a result
  still waiting to be sent.
- Screen: Results (F5): to-do / completed / all, search, reference range and unit pre-filled, Enter saves and moves to the next test.
- NOT done: patient notification when a result is completed. The website does this client-side through the existing `send-email`
  (Mailjet/Resend) and `send-whatsapp` edge functions; Twilio/SMS is NOT configured and is not used. The native app must call those same
  functions. Multi-parameter panels (result_items, e.g. CBC components) and report templates are next.
- Pending production migrations (the user applies them): 20261029000300 (reserved lab names), 000400 (record_payment), 000500 (test ids).

## Update: panel results and printed reports (milestone 2)
- Panel (multi-value) results use the website's `result_items` format exactly (name, value, unit, normal_range_min/max, normal_range_text);
  CBC opens with the website's 20 built-in rows, any other test can be switched to a panel. Abnormal when any row is outside its numeric range.
- Printed report: `ReportBuilder` + `ReportHtml` (A4, opens in the system browser, prints on any printer): patient block, one table per
  completed test (panels as tables), reference ranges, abnormal marked in bold with `*`, "Preliminary" banner while results are unsent.
- Not yet: the website's report templates (test_templates header/footer/format), lab logo/address/phone branding, reports for the patient portal
  (the portal builds its own PDF from the synced results), notification to the patient on completion (existing send-email / send-whatsapp only).

## Update: labels and patient editing
- Sample labels (50x25 mm, one per page, copies) with a Code 128 barcode of the patient code. The barcode generator is verified by an
  independent decoder (ZXing) on 7 sample codes. Printed from Register visit and from Bills.
- Labels/receipts printed before sync keep working: when the server replaces a provisional patient code or bill number (or merges a patient by phone),
  the old value is kept as an alias and scans still find the patient/bill.
- Edit patient (Patients screen, double-click): offline; queued as a PATCH of that patients row (same as the website's edit); refused changes
  restore the old details; newer server data never overwrites a waiting edit; a patient not yet on the server is updated inside its waiting visit.

## Update: installers (native)
- `native-release.yml` builds, on a published GitHub release (or a manual dry run that only keeps artifacts): macOS Apple Silicon + Intel (.pkg),
  Windows (Setup.exe), Ubuntu/Linux (AppImage) with Velopack (`vpk`), self-contained (no .NET needed on the PC). Each is also a portable build.
  The version comes from the release tag (`v1.2.3`). Verified locally: macOS arm64 .pkg builds (47 MB) and the packaged app starts at the login screen.
- Not signed or notarized yet (macOS will warn on first open; Windows SmartScreen will warn). Signing needs an Apple Developer ID and a Windows code-signing
  certificate. Auto-update (Velopack) needs a public place to serve the update files; the repo is private.

## Update: design pass + branding
- Premium design: the website's clinical blue/navy as a design system (cards, status badges, refined tables, icons), navy sidebar with icons,
  top bar with a live sync badge, a home screen (visits today, tests to do, takings today, still to collect, recent bills, quick actions),
  empty states, a new split-panel login. Screens are checked by rendering them headless (DesignReviewTests with LABSHOPE_SHOT_DIR=...).
- Branding: name, address, phone, email, logo (embedded for offline printing), report tagline and footer wording come from the same public lab
  lookup the website uses (get_public_organization_context) and are used on receipts and reports. Refreshed at most every 6 hours.

## Update: Reports, Finance, Test catalog
- Reports (F6, offline): billed / collected / outstanding / visits / tests, collections by day (bar chart), by payment method, most ordered tests, for
  Today / 7 days / 30 days / this month. Local calendar days (UTC offset applied); cancelled bills excluded.
- Finance (admin/employee only, needs internet): trial balance and recent posted journal entries, same method as the website (accounts + posted entries
  + lines, chunked). Says whether the books balance. Verified against the real database: bill + payments posted automatically and tally.
- Test catalog: tests (price, unit, normal range), packages, doctors, searchable offline. Admins can edit a test's price/unit/range/active flag (PATCH of the
  tests row, online); the new values reach the PC with the next catalog pull. Verified against the real database.
- Not yet native: employees/roles, labs & collection centres, external labs, inventory, booking requests, notice board, report templates, settings,
  subscription. Analyzer integration waits for the machine models.

## Update: Booking requests
- Booking requests made on the website are pulled to the PC (90 days, then changes), listed with New/All/Contacted/Scheduled/Converted/Closed (the website's
  statuses), with a red count of new ones on the sidebar. Status changes work offline and are queued as a PATCH of that booking_requests row.
- "Register a visit for this person": opens Register visit with the patient (existing one matched by phone, else a new one pre-filled) and the requested tests
  that match the catalog by name; on save the booking is marked converted and linked to the patient (queued after the visit so the patient exists first).
  Verified against the real database.

## Update: "your reports are ready" email
- When a result entered on the PC is confirmed by the server and every test of that patient's visit date is finished, the patient is emailed using the website's
  own "All Test Results Ready" wording (or the lab's own wording from its settings), the same HTML layout, through the same `send-email` edge function
  (Mailjet/Resend). No SMS/Twilio. No address on file = nothing sent (same as the website). Sent once; kept queued while offline.
- The patient portal link uses the lab's primary web address (organization_domains), falling back to <slug>.labshope.com.
- Not verified end to end: edge functions do not run in the local test database, so the live send-email call (provider credentials) was not exercised; it is covered
  by tests against a stand-in server only.
- WhatsApp (send-whatsapp) is not used for result-ready messages by the website, so not here either.

## Update: safety net and "Sync & settings"
- Safety net: unexpected errors in a window or a background task are written to a daily log file (kept 14 days) and the app carries on, showing a short notice.
- Sync & settings screen: sync state, everything waiting to be sent or refused (with the server's reason), Retry (put back in the queue) and Discard
  (removes a refused visit with its bill, tests, payments and a patient created only for it; other kinds just drop), account/lab/access/version, and the logs folder.
  The sidebar shows a red count of refused items.

## Update: phone is optional, shared numbers are a choice
- A patient may be registered with no phone ("No phone number" option; stored empty, never matched on phone). A phone that is already registered now raises the website's
  "phone number already registered" choice (use that patient, or carry on with a new one: family members often share a number) instead of silently merging.
  Editing a patient's phone is optional and may be shared too.
- Server: migration 20261029000600 lets register_visit accept patient.new.no_phone and patient.new.allow_duplicate_phone. Until it is applied, a no-phone registration is
  refused by the server (shows under Sync & settings), and "create anyway" is merged by the old function. Tested in supabase/tests/register_visit.test.sql (6d).
- Pending production migrations (applied later by the owner): 000300, 000400, 000500, 000600.

## Update: Labs & team, Inventory
- Labs & team: labs and collection centres (from the PC's catalog) and the staff list (read from the server, read-only; accounts and access are managed on the website).
- Inventory (needs internet): items with stock, minimum and Low/Out warnings; "Stock used" and "Stock bought" follow the website's two steps (a log line in
  inventory_usage / inventory_purchases, then the item's stock moves) but use the freshly read stock level, refuse more than is in stock, and say plainly when the log line
  was saved but the stock update was not. Verified against the real database (50 -> 45 -> 65, over-use refused).
- Still not native: external labs, report templates (test_templates), subscription, notification settings, roles/permissions, visitor logs, quick setup.

## Update: report templates
- The lab's report templates (test_templates: header/footer wording with {markers}, show/hide reference range and abnormal marking) are pulled with the catalog
  (together with test categories) and applied to printed reports. Template choice follows the website: the lab's own before shared ones; one test -> the template made
  for that test, then its category; several tests of one category -> that category; otherwise the default template; otherwise none (plain report as before).
- Markers filled: patient_name, patient_id, phone, test_name, test_date, report_date, lab_name, lab_code, collection_center (empty), entered_by (the lab's name).
  Simple HTML in the template (p, br, li) becomes text lines, as on the website. "list"/"custom" result formats and notes are not implemented (printed as the table).

## Update: external labs (outsourcing)
- External labs (vendors) sync with the catalog. On the Results screen, "Send to an external lab..." records the lab and the cost on that test (the website's own columns:
  external_lab_id, outsource_cost, outsourced_at, outsourced_by) as a queued update of the patient_tests row, so it works offline. The database's existing rule then posts
  Dr 5009 Outsourcing Expense / Cr 2004 Outsource Payable. The worklist shows "test -> lab". Refused outsourcing is shown as not outsourced again.
  Verified against the real database: the row is updated, the journal entry is linked, and the books still balance.
- IMPORTANT: that rule silently posts nothing if the lab's chart of accounts has no 5009 and 2004 (the website seeds them with seed_outsource_accounts). Check each lab has them.
- Managing the vendor list (add/edit external labs) stays on the website.
