# Desktop app downloads (Cloudflare R2)

The **Native Release** workflow builds the installers and, for a real (non pre-release) GitHub release, also uploads them to the R2 bucket `labshope-lims`:

```
releases/<version>/...                 every file of that build (installer, portable, update packages)
latest/LabShope-LIMS-<platform>.<ext>  the installer under a fixed name
latest/latest.json                     version, published date, file and size per platform
```

Platforms: `windows-64bit` (.exe), `windows-32bit` (.exe), `mac-apple-silicon` (.pkg), `mac-intel` (.pkg), `linux` (.AppImage).

The website page `/download` (platform site) reads `latest/latest.json` and links to the fixed names. If the list can't be read it still links to the fixed names.

## One-time setup

1. **GitHub secrets** (repository settings, Secrets and variables, Actions): `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from an R2 API token with *Object Read & Write* on the `labshope-lims` bucket only. Without them the workflow skips the upload and everything else still works.
   Optional repository *variables*: `R2_ACCOUNT_ID` and `R2_BUCKET` (defaults are this project's account and `labshope-lims`).
2. **Public address:** bucket settings, Custom Domains, connect a domain such as `downloads.<your-domain>` (recommended for production; the *Public Development URL* also works but is rate limited and not for production).
3. **CORS policy** (bucket settings, CORS Policy) so the website can read `latest.json`:

   ```json
   [
     {
       "AllowedOrigins": ["https://<your-marketing-domain>"],
       "AllowedMethods": ["GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. **Website build setting:** `VITE_DOWNLOADS_BASE_URL=https://downloads.<your-domain>` (no trailing slash). Until it is set the page says "Downloads are being prepared".

## Notes

- The installers are not code-signed yet: Windows shows SmartScreen and macOS asks to Control-click Open. The page says so.
- Dry runs (manual workflow runs) and pre-releases never touch the bucket.
- Old versions stay under `releases/<version>/`; delete them from the bucket if space matters.
