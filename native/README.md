# LabShope LIMS: native desktop app

The desktop software for lab front desks and benches (macOS, Windows, Ubuntu). It works fully offline and syncs with the
same LabShope account and database as the website. Built with .NET 10 and Avalonia.

## For labs

**Install:** download the installer for your system from the latest GitHub release, run it, and sign in with the email and
password you use on the LabShope website. The first sign-in needs internet; after that the app opens offline.

| System | File |
|---|---|
| macOS (Apple Silicon / Intel) | `LabShopeLIMS-osx-Setup.pkg` |
| Windows | `LabShopeLIMS-win-Setup.exe` |
| Ubuntu / Linux | `LabShopeLIMS-linux-Setup.AppImage` |

The installers are not signed yet, so macOS and Windows show a warning the first time you open them.

**Everyday use**
- Register visit (F4): find or add the patient, pick tests, take payment, print the receipt and sample labels.
- Results (F5): type results (a CBC opens as a full panel), Enter saves and opens the next test, print the patient's report.
- Bills & payments (F3), Daily cash book (F7), Reports (F6), Booking requests (from your website), Test catalog, Inventory, Finance.
- A barcode scan works from any screen and opens the patient. Label barcodes carry the patient code.
- The status chip at the top shows whether you are connected. Nothing is lost offline: work is saved on the PC and sent when the connection returns.
  Anything the server refuses is listed under **Sync & settings** with the reason, and can be retried or discarded.

**Lab machines (analyzers):** open *Lab machines*.
- Network machine: tick the network option, choose a port (5000 is fine), Save. In the analyzer's own settings enter this computer's address
  (shown on the screen) and that port, in HL7 or ASTM mode. Use *Send a test message to myself* to check the listener.
- Serial (COM) machine: tick the serial option, pick the COM port, set the same baud rate as the analyzer (usually 9600), Save.
- Put the patient code (the barcode on the label) in the analyzer's sample ID. Results then appear on the screen matched to the patient;
  *Accept* fills in the waiting test (a CBC gets all its values). Every machine is a little different; if values don't match, send the log
  (Sync & settings -> Open logs folder) to support.

## For developers

```
native/
  src/LabShope.Core    data, sync, accounting-aware services, analyzer protocols (no UI)
  src/LabShope.App     Avalonia screens
  tests/               xUnit: core logic (fake and real server) and headless UI tests
  assets/              app icons
```

```
dotnet build native
dotnet test native                       # core + UI tests (no network needed)
scripts/test-db.sh                       # rebuilds the database from the migrations, runs the SQL tests and the real-database integration test
LABSHOPE_SHOT_DIR=/some/dir dotnet test native/tests/LabShope.App.Tests   # also saves screenshots of every screen
dotnet run --project native/src/LabShope.App
```

How it works: every screen reads a local SQLite database (one per lab). Changes are saved locally at once and queued in an outbox;
the sync runs every minute and sends the queue (visits, payments, results, patient edits, booking updates, outsourcing) using the same tables, rules and
server functions as the website, then pulls what changed. Bills and payments reach the books through the database's existing accounting rules.
See `docs/planning/NATIVE_CLIENT_PLAN.md` for the full design notes and the list of known limits.

Release: publish a GitHub release tagged `vX.Y.Z`; `.github/workflows/native-release.yml` builds and attaches the installers (run it manually for a dry run).
