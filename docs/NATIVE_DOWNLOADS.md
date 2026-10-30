# Desktop app downloads (Cloudflare R2)

The **Native Release** workflow builds the installers and, for a real (non pre-release) GitHub release, also uploads them to the R2 bucket `labshope-lims`:

```
releases/<version>/...                 every file of that build (installer, portable, update packages)
latest/LabShope-LIMS-<platform>.<ext>  the installer under a fixed name
latest/latest.json                     version, published date, file and size per platform
```

Platforms: `windows-64bit` (.exe), `windows-32bit` (.exe), `mac-apple-silicon` (.pkg), `mac-intel` (.pkg), `linux` (.AppImage).

**Right now the Windows and Mac installers are built** (Linux is switched off to save GitHub Actions minutes: a macOS build costs 10 times a Linux one, Windows twice). The download page shows Linux as "Coming soon" because it is missing from `latest.json`. To build Linux again, remove the `# ` in front of its line in the matrix of `.github/workflows/native-release.yml`.

The website page `https://lims.labshope.com/download` (platform site) reads `latest/latest.json` and links to the fixed names. If the list can't be read it still links to the fixed names.

## One-time setup

1. **GitHub secrets** (repository settings, Secrets and variables, Actions): `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from an R2 API token with *Object Read & Write* on the `labshope-lims` bucket only. Without them the workflow skips the upload and everything else still works.
   Optional repository *variables*: `R2_ACCOUNT_ID` and `R2_BUCKET` (defaults are this project's account and `labshope-lims`).
2. **Public address:** bucket settings, Custom Domains, connect a subdomain such as `lims-downloads.labshope.com` (the domain must be on Cloudflare DNS) (recommended for production; the *Public Development URL* also works but is rate limited and not for production).
3. **CORS policy** (bucket settings, CORS Policy) so the website can read `latest.json`:

   ```json
   [
     {
       "AllowedOrigins": ["https://lims.labshope.com"],
       "AllowedMethods": ["GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. **Website:** nothing to set. The page uses `https://lims-downloads.labshope.com` by default. To use another address set `VITE_DOWNLOADS_BASE_URL` for the website build (no trailing slash); `off` hides the downloads.

## Notes

- The installers are not code-signed yet: Windows shows SmartScreen and macOS asks to Control-click Open. The page says so.
- Dry runs (manual workflow runs) and pre-releases never touch the bucket.
- Old versions stay under `releases/<version>/`; delete them from the bucket if space matters.
