# LabShope LIMS – Desktop app

A native wrapper around the LIMS for macOS, Ubuntu/Linux and Windows. It opens
your lab's own workspace (`https://<workspace>.labshope.com`) in a dedicated
window, with a first-run workspace picker, an offline/retry screen, window
state, native printing and downloads, and automatic updates.

> Phase 1 needs an internet connection. Offline registration with background
> sync is the next phase and needs server-side changes (see below).

## Develop

```sh
cd desktop
npm ci
npm start          # run the app
npm test           # unit tests (workspace address handling)
npm run smoke      # boots the real main process and checks the local pages
npm run dist       # build installers for the current OS into desktop/dist
```

If you launch from an editor terminal and Electron behaves like plain Node,
unset `ELECTRON_RUN_AS_NODE` first.

The default domain is set in `config.json` (`baseDomain`). Override it for a
run with `LIMS_BASE_DOMAIN=localhost npm start` and enter `demo.localhost:8080`
to point at a local dev server.

## Releasing

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

Installed apps check the repository's GitHub releases on start and every four
hours, download updates in the background and offer a restart. This works for
the AppImage, the Windows installer and (once signed) macOS. The `.deb` does not
self-update. If the repository is private, the updater needs a read token baked
into the app, so keep the releases repository public or host updates elsewhere.

## Offline phase (planned)

The app currently loads the live tenant site because the edge functions only
accept requests from configured `https` origins. Serving a bundled copy of the
app for offline use means the desktop origin must be allow-listed in those
functions first, plus a local database and a sync queue for patient registration.
