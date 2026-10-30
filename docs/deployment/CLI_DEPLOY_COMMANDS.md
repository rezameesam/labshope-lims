# CLI Commands to Deploy Edge Function and Set Secrets

Run these commands in your terminal:

## Step 1: Deploy Edge Function

```bash
supabase functions deploy send-email
```

This will:
- Deploy the `send-email` function from `supabase/functions/send-email/index.ts`
- Make it available at `https://pxsutovdzppoyyfrbeaw.supabase.co/functions/v1/send-email`

## Step 2: Set Mailjet Secrets

```bash
supabase secrets set \
  MAILJET_API_KEY=<your-mailjet-api-key> \
  MAILJET_SECRET_KEY=<your-mailjet-secret-key> \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"
```

This will:
- Add all 4 secrets to your Supabase Edge Function environment
- Make them available to the `send-email` function

## Step 3: Verify

```bash
# List all secrets (to verify they're set)
supabase secrets list

# Check function status
supabase functions list
```

## Alternative: Run the Script

Or simply run the script I created:

```bash
./deploy-edge-function.sh
```

## Troubleshooting

If you get "Access token not provided":
1. Run `supabase login` first
2. Follow the login link in your browser
3. Enter the verification code
4. Then run the deploy commands

If deployment fails:
- Check that `supabase/functions/send-email/index.ts` exists
- Verify you're in the project root directory
- Make sure the project is linked: `supabase link --project-ref pxsutovdzppoyyfrbeaw`


