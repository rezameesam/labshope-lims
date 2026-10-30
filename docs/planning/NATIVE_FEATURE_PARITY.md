# Native app vs the online app: feature parity

The native app must offer what the online (web) app offers, reusing the same tables, rules and server functions.
This list is built from the web app's own admin menu (`src/components/admin/adminDashboardConfig.ts`, 26 sections) and
the actions inside each screen. Status: **Done** (works and tested), **Partial** (some of it), **Missing**.

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
| Subscription | trial notice only | Partial | Plan details, upgrade and payment |
| Finance | Finance | Done (online only) | |
| Quick Setup | none | Missing | Guided first-time setup |
| System Settings | none | Missing | Lab details (name, address, logo), report branding |
| Notifications | none | Missing | Notification wording and channels (the app already uses the lab's wording) |
| Roles & Permissions | none | Missing | Everything |
| Security | none | Missing | Sessions/devices |
| Visitor Logs | none | Missing | Everything |

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
6. Notice board, reminders, lab sheets, visitor logs, security.
