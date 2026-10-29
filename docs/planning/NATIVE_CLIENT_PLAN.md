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
