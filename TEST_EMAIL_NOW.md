# Test Email Service

## ✅ Setup Complete!

Your email service is now configured:
- ✅ Mailjet secrets set
- ✅ Edge Function redeployed
- ✅ Ready to send emails

## Test Now (3 Options)

### Option 1: Admin Dashboard (Easiest)

1. Go to your Admin Dashboard
2. Navigate to **Notifications** tab
3. Enter your email address
4. Click **Send Test Email**
5. Check your inbox (and spam folder)

### Option 2: Edge Function Dashboard

1. Go to: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/functions/send-email
2. Click **Invoke function**
3. Use this payload:

```json
{
  "to": "your-email@example.com",
  "subject": "Test Email from IRM Clinic",
  "htmlContent": "<h1>Test Email</h1><p>This is a test email from IRM Clinic email service.</p><p>If you received this, the email service is working correctly!</p>"
}
```

4. Click **Invoke**
5. Check the response - should show `{"success": true, "service": "mailjet"}`
6. Check your inbox

### Option 3: Using curl

```bash
curl -X POST "https://pxsutovdzppoyyfrbeaw.supabase.co/functions/v1/send-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_FBGkelHPPulufbpPPDbSRA_OqyUCSul" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test Email",
    "htmlContent": "<h1>Test</h1><p>Email service test</p>"
  }'
```

## Expected Response

**Success:**
```json
{
  "success": true,
  "messageId": "...",
  "service": "mailjet"
}
```

**Error (if still not working):**
```json
{
  "success": false,
  "error": "..."
}
```

## If Email Doesn't Arrive

1. **Check spam folder** - Mailjet emails sometimes go to spam initially
2. **Check Edge Function logs:**
   - Dashboard → Edge Functions → send-email → Logs
   - Look for error messages
3. **Verify Mailjet account:**
   - Log in to Mailjet dashboard
   - Check account status
   - Verify API keys are active
   - Check sending limits (free tier: 6,000 emails/month)

## Troubleshooting

### Still getting "Email service not configured"
- Wait 1-2 minutes for secrets to fully propagate
- Redeploy function: `supabase functions deploy send-email`
- Check secrets are set: `supabase secrets list`

### Getting "401 Unauthorized" or "Mailjet API error"
- Verify API keys in Mailjet dashboard
- Check Mailjet account is active
- Verify keys have send permissions

### Email sent but not received
- Check spam folder
- Verify recipient email is correct
- Check Mailjet dashboard for delivery status
- Verify Mailjet account hasn't hit rate limits

---

**Try testing now!** The email service should work. 🎉

