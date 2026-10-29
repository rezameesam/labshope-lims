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
