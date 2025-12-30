# Yandex Email Setup for irmclinic.com

## Quick Setup (5 minutes)

Since you already have `no-reply@irmclinic.com` hosted on Yandex, you can use it directly!

## Step 1: Get Your Yandex Email Password

1. Log in to your Yandex email account (`no-reply@irmclinic.com`)
2. Go to **Settings** → **Security** → **App passwords**
3. Create a new app password for "Mail" (or use your regular password)
4. Copy the password

## Step 2: Install Nodemailer

```bash
npm install nodemailer
```

## Step 3: Add to Your .env File

Create or edit your `.env` file in the project root:

```env
# Yandex SMTP Configuration
VITE_SMTP_HOST=smtp.yandex.com
VITE_SMTP_PORT=465
VITE_SMTP_USER=no-reply@irmclinic.com
VITE_SMTP_PASSWORD=your_yandex_password_here
VITE_SMTP_FROM=no-reply@irmclinic.com
VITE_SMTP_SECURE=true
```

**Important Notes:**
- Use port `465` for SSL (secure) - recommended
- Or use port `587` for TLS (set `VITE_SMTP_SECURE=false`)
- `VITE_SMTP_FROM` should match your email address
- Use app password if 2FA is enabled on your Yandex account

## Step 4: Restart Your Development Server

```bash
npm run dev
```

## Step 5: Test It!

1. Go to Admin Dashboard → **Notifications** tab (in the sidebar)
2. Enter your email address in the test field
3. Click "Send Test Email"
4. Check your inbox!

## Yandex SMTP Settings

| Setting | Value |
|---------|-------|
| **SMTP Server** | smtp.yandex.com |
| **Port (SSL)** | 465 |
| **Port (TLS)** | 587 |
| **Security** | SSL/TLS |
| **Authentication** | Required |

## Troubleshooting

### "Authentication failed" Error

**Problem**: Wrong password or 2FA enabled

**Solution**:
1. Make sure you're using the correct password
2. If 2FA is enabled, create an app password:
   - Yandex → Settings → Security → App passwords
   - Create password for "Mail"
   - Use that password instead

### "Connection timeout" Error

**Problem**: Firewall or port blocked

**Solution**:
1. Try port 587 instead of 465:
   ```env
   VITE_SMTP_PORT=587
   VITE_SMTP_SECURE=false
   ```
2. Check if your network allows SMTP connections

### "Relay access denied" Error

**Problem**: Yandex blocking the connection

**Solution**:
1. Make sure you're using the correct email address
2. Check Yandex security settings
3. Try enabling "Less secure apps" (if available)

### Emails Going to Spam

**Solution**:
1. Make sure SPF and DKIM records are set up for irmclinic.com
2. Check Yandex domain settings
3. Warm up your domain by sending gradually

## Advantages of Using Your Own Domain Email

✅ **Professional**: Emails come from `no-reply@irmclinic.com`  
✅ **Free**: No additional cost  
✅ **Unlimited**: No monthly limits (within Yandex's limits)  
✅ **Branded**: Matches your clinic's domain  
✅ **Reliable**: Uses your existing email infrastructure  

## Yandex Email Limits

- **Daily sending limit**: Usually 500-1000 emails/day (varies by account)
- **No monthly limit**: Unlike Resend's 3,000/month
- **Perfect for clinics**: More than enough for patient notifications

## Security Best Practices

1. **Use App Password**: If 2FA is enabled, use app password instead of main password
2. **Don't commit .env**: Make sure `.env` is in `.gitignore`
3. **Rotate passwords**: Change password periodically
4. **Monitor usage**: Check Yandex logs for unusual activity

## Next Steps

Once configured:
1. ✅ Test email sending
2. ✅ Mark a test as completed to verify automatic notifications
3. ✅ Send a reminder manually
4. ✅ Try promotional messaging

Your email system is now ready! 🚀

