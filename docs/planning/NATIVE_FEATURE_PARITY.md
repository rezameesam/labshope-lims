# Native app vs the online app: feature parity

The native app must offer what the online (web) app offers, reusing the same tables, rules and server functions.
This list is built from the web app's own admin menu (`src/components/admin/adminDashboardConfig.ts`, 26 sections) and
the actions inside each screen. Status: **Done** (works and tested), **Partial** (some of it), **Missing**.

> **Status update, 30 Oct 2026:** since this table was written the native app gained: billing details/edit/filters, patients (add alone, switch off/on, history, email),
> repeat-test warning, catalog management (packages, doctors, external labs, categories, report templates), inventory item management, labs, collection centres,
> staff edit and reset password, lab profile and logo, and automatic updates. Rows below that still say Missing/Partial for those are out of date; the
> list of what is genuinely still missing is in `HANDOFF_2026-10-30.md`.

## Work

| Web section | Native | Status | What is missing |
|---|---|---|---|
| Overview | Overview | Partial | Charts and trends; notice board panel |
| Notice Board | none | Missing | Read and post notices |
| Booking Requests | Booking requests | Partial | Link to an existing patient from the request; create patient from request (only "register from request" exists) |
| Patients | Patients | Partial | ~~Add patient on its own, activate/deactivate, history of bills/tests~~ (done); send/reset portal password, ABHA/ABDM |
| Lab Sheets | none | Missing | Everything |
| Patient Tests | Results | Partial | Add tests to an existing patient's visit later, edit a saved result, audit history, bulk print of selected tests |
| Billing | Bills & payments | Partial | ~~Edit invoice, bill details (items, payments, audit history), status/date filters, summary~~ (done); invoice for existing tests, PDF download, payment-received message |
| Reminders | none | Missing | Everything |

## Catalog

| Web section | Native | Status | What is missing |
|---|---|---|---|
| Test Catalog | Test catalog | Partial | Panel items editor, categories, delete test, edit name/sample type (only price/unit/range edit and add exist) |
| Test Packages | catalog tab (read) | Partial | Create/edit/delete packages |
| Templates | used by reports | Partial | Create/edit report templates |
| Inventory | Inventory | Partial | Add/edit/delete items, categories, maintenance schedule |
| Doctors | catalog tab (read) | Partial | Add/edit doctors, commission settings, referral reports |

## Manage

| Web section | Native | Status | What is missing |
|---|---|---|---|
| Employees | Labs & team | Partial | Edit staff details, reset a staff password, assign custom roles |
| Labs | Labs & team (read) | Partial | Add/edit labs |
| Collection Centers | Labs & team (read) | Partial | Add/edit centres, centre analytics |
| External Labs | outsource dialog | Partial | Add/edit external labs (they can only be used) |
| Reports | Reports | Partial | Financial reports, lab and collection-centre analytics, exports |

## Account

| Web section | Native | Status | What is missing |
|---|---|---|---|
| Subscription | Subscription page (admins) | Done | Paying/changing plan stays on the website |
| Patient report | Test report PDF | Done | Same layout as the website; print options (header/footer/watermark); shows blood group, registry no, centre, notes and who entered results (pulled from the server, entered on the website) |
| Finance | Finance | Done (online only) | Trial balance, Profit & loss, Balance sheet, Account ledger, Chart of accounts (add, change, switch on or off, create defaults), New entry (quick income, expense, transfer, capital, or custom lines) and Outsource report |
| Quick Setup | none | Website only | First-time lab onboarding is done on the website |
| System Settings | Lab profile in Sync & settings | Partial | Payment, WhatsApp and email provider keys stay on the website (secrets) |
| Notifications | none | Website only | Provider keys and test email; the app already uses the lab's wording |
| Roles & Permissions | Roles & permissions (admins) | Done (online only) | |
| Security | none | Website only | Browser sessions/devices |
| Visitor Logs | none | Not wanted | Website only, by decision (2026-10-31); do not build in the native app |

## Native-only (desktop reasons)
Barcode scanning from any screen, lab-analyzer connections, offline work with a send queue, backups and recovery,
direct receipt printing, full screen.

## Done in this round
- Discount when registering a visit (stored like the website: amount, who entered it, final amount).

## Suggested order
1. Billing: edit invoice (price lines + discount), payment history, reprint.
2. Patients: add patient alone, active/inactive, visit and bill history, add tests to a visit.
3. Catalog management: packages, doctors, external labs, categories, templates, inventory items.
4. Manage: labs, collection centres, staff edits.
5. Account: system settings (lab details/logo), notifications, subscription, roles.
6. Notice board, reminders, lab sheets, security. (Visitor logs and the patient portal are website only, by decision.)
