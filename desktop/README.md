# LabShope LIMS – Desktop app

A native app for macOS, Ubuntu/Linux and Windows. The installer ships its own
copy of the LIMS web app, so it opens instantly from disk instead of
downloading the app on every start. Data still comes from your lab's Supabase
backend. It also has a first-run workspace picker, window state, native
printing and downloads, and automatic updates.

> Today the app needs an internet connection for data. The next phase adds a
> local database and a sync queue so reads are instant and registration works
> offline.

## How it opens your lab

- Workspaces under the base domain (e.g. `demo` -> `demo.labshope.com`) are
  served from the bundled web app at `http://demo.localhost`. The app
  intercepts that address inside Electron, so no network port is opened and the
  server sees the same local-style origin it already supports.
- Custom domains and dev servers (`demo.localhost:8080`) load the live site.
- `LIMS_REMOTE=1` forces the live site, which is also used when no bundled copy
  was built.

## Develop

```sh
cd desktop
npm ci
npm run prepare:web  # build the web app into desktop/app (uses the repo .env)
npm start          # run the app
npm test           # unit tests (workspace address handling)
npm run smoke      # boots the real main process and checks the local pages
npm run smoke:bundled  # boots with a saved workspace and checks the bundled web app
npm run dist       # build installers for the current OS into desktop/dist
```

If you launch from an editor terminal and Electron behaves like plain Node,
unset `ELECTRON_RUN_AS_NODE` first.

The default domain is set in `config.json` (`baseDomain`). Override it for a
run with `LIMS_BASE_DOMAIN=localhost npm start` and enter `demo.localhost:8080`
to point at a local dev server.

## Releasing

Set these as repository **Variables** first (Settings -> Secrets and variables
-> Actions -> Variables). They are public client-side values, the same ones in
your `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_PUBLIC_BASE_DOMAIN` (required) and `VITE_SUPABASE_PROJECT_ID`,
`VITE_PLATFORM_HOSTNAME`, `VITE_PUBLIC_LOGO_URL`, `VITE_PLATFORM_LABEL`,
`VITE_PLATFORM_PRODUCT_NAME`, `VITE_PLATFORM_COMPANY_NAME`,
`VITE_PLATFORM_CONTACT_EMAIL`, `VITE_PLATFORM_TAGLINE`, `VITE_RAZORPAY_KEY_ID`,
`VITE_TURNSTILE_SITE_KEY`, `VITE_PAGES_CNAME_TARGET`. The build fails with a
clear message if a required one is missing.

1. Create a GitHub release with a tag like `v1.2.0` and publish it.
2. The **Desktop Release** workflow builds, in parallel:
   - macOS: `.dmg` and `.zip` for Apple Silicon (arm64) and Intel (x64)
   - Ubuntu/Linux: `.AppImage` and `.deb` (x64)
   - Windows: `.exe` installer (x64)
3. Every bundle, plus the `latest*.yml` update manifests, is attached to the release.

To test without publishing, run the workflow manually from the Actions tab.
The bundles are kept as workflow artifacts for 14 days.

The app version always comes from the release tag.

## Code signing (not set up yet)

Builds are unsigned, so first launch shows OS warnings:

- **macOS**: Gatekeeper blocks unsigned apps. Needs an Apple Developer ID
  certificate and notarization to install cleanly. Until then, users right-click
  the app and choose Open, or run `xattr -cr "/Applications/LabShope LIMS.app"`.
  Auto-update on macOS only works once the app is signed.
- **Windows**: SmartScreen warns on unsigned installers. Needs a code-signing certificate.
- **Linux**: no signing required.

Add the certificates as repository secrets and pass them to `electron-builder`
(`CSC_LINK`, `CSC_KEY_PASSWORD`, and the `APPLE_*` notarization variables).

## Auto-update

Installed apps check the repository's GitHub releases on start and every 30
minutes, download updates in the background and offer a restart. This works for
the AppImage, the Windows installer and (once signed) macOS. The `.deb` does not
self-update. If the repository is private, the updater needs a read token baked
into the app, so keep the releases repository public or host updates elsewhere.

## Offline phase (planned)

Next: a local database (IndexedDB) holding the test catalog, packages, doctors
and recent patients, so lookups and pickers are instant; and a write queue so
registering a patient or ordering a test saves locally at once and syncs in the
background with idempotent retries. Needs a server-side "register patient"
function that accepts a client-generated id, and a plan for offline patient and
invoice numbers.
