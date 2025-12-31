# Email Service Diagnostic

## Issues Found

### 1. **Buffer Error (Primary Issue)**
- **Status**: Still occurring
- **Error**: `"Buffer is not defined"`
- **Location**: Edge Function `send-email`
- **Cause**: `npm:buffer@6.0.3` polyfill not working in Supabase Edge Functions

### 2. **NotificationSettings Component Issue**
- **Problem**: Component checks for `VITE_SMTP_HOST` (client-side env var)
- **Reality**: SMTP credentials are in Supabase Edge Function secrets (server-side)
- **Impact**: Shows "Not Configured" even when secrets are set

### 3. **Response Handling**
- **Status**: ✅ Correct
- The `notificationService.ts` correctly handles Edge Function responses

## Root Cause Analysis

The main issue is the **Buffer polyfill not working** in Supabase Edge Functions. Even though we're setting:
- `globalThis.Buffer = Buffer`
- `global.Buffer = Buffer`
- `window.Buffer = Buffer`

The error persists, suggesting that:
1. The Buffer polyfill isn't being loaded before nodemailer tries to use it
2. Or nodemailer is accessing Buffer in a way our polyfill doesn't cover
3. Or Supabase's Deno runtime has restrictions on npm:buffer

## Solutions

### Solution 1: Fix Buffer Issue (Try This First)
Update the Edge Function to ensure Buffer is available in all contexts before nodemailer loads.

### Solution 2: Use Resend API (Recommended if Buffer Fix Fails)
Switch to Resend API which uses HTTP requests - no Buffer dependency.

### Solution 3: Fix NotificationSettings UI
Update the component to check Edge Function status instead of client-side env vars.

## Next Steps

1. Try the enhanced Buffer fix
2. If that fails, implement Resend API
3. Fix NotificationSettings component to show correct status

