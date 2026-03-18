# Test Edge Function

## Current Status
- ✅ Edge Function URL: `https://lkxvaqwqpuwhdscxzxud.supabase.co/functions/v1/send-email`
- ✅ SMTP Secrets configured in Supabase
- ✅ Code updated with Buffer polyfill

## Important: Make Sure Code is Deployed

The code in your local file has the Buffer fix, but you need to make sure it's deployed to Supabase. In the previous platform:

1. Check if the "Refactor Buffer import in send-email..." task is completed
2. Make sure the Edge Function is redeployed with the latest code
3. The code should have these lines at the top:
   ```typescript
   import { Buffer } from "npm:buffer@6.0.3";
   globalThis.Buffer = Buffer;
   // ... (and global/window assignments)
   ```

## Check Edge Function Logs

In Supabase Dashboard:
1. Go to **Edge Functions** → **send-email**
2. Click **Logs** tab
3. Look for detailed error messages

The logs will show exactly where the Buffer error is occurring.

## Test the Function

You can test directly from the browser console or from your app's Notification Settings page.

## If Buffer Error Persists

If the error continues after redeploying, we may need to:
1. Check the exact Deno version Supabase uses
2. Try a different Buffer polyfill approach
3. Consider using Resend API instead (no Buffer issues)

