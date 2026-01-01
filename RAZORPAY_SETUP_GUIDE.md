# Razorpay Integration Setup Guide

## ✅ What's Been Done

1. ✅ Installed Razorpay SDK
2. ✅ Created database migration for Razorpay fields
3. ✅ Created Razorpay service (frontend)
4. ✅ Created Edge Functions:
   - `create-razorpay-order` - Creates payment orders
   - `razorpay-webhook` - Handles payment verification
5. ✅ Created RazorpayButton component
6. ✅ Updated BillingPortal with Razorpay payment option

## 📋 Setup Steps

### Step 1: Run Database Migration

```bash
# Apply the migration
supabase db push
```

Or manually in Supabase Dashboard:
1. Go to Database → Migrations
2. Copy SQL from `supabase/migrations/20250101000001_add_razorpay_fields.sql`
3. Run it

### Step 2: Set Environment Variables

Add these to your `.env` file:

```env
VITE_RAZORPAY_KEY_ID=rzp_test_RydGUMk2onInkU
```

### Step 3: Set Supabase Secrets

Set Razorpay credentials as Supabase secrets for Edge Functions:

```bash
# Set Razorpay credentials
supabase secrets set RAZORPAY_KEY_ID=rzp_test_RydGUMk2onInkU
supabase secrets set RAZORPAY_KEY_SECRET=aBGYqeGBV9YRFMoeFIHgOlMK
```

Or via Dashboard:
1. Go to Project Settings → Edge Functions → Secrets
2. Add:
   - `RAZORPAY_KEY_ID` = `rzp_test_RydGUMk2onInkU`
   - `RAZORPAY_KEY_SECRET` = `aBGYqeGBV9YRFMoeFIHgOlMK`
   - (Optional) `RAZORPAY_WEBHOOK_SECRET` = Your webhook secret

### Step 4: Deploy Edge Functions

```bash
# Deploy both functions
supabase functions deploy create-razorpay-order
supabase functions deploy razorpay-webhook
```

### Step 5: Configure Razorpay Webhook (Optional but Recommended)

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com)
2. Navigate to Settings → Webhooks
3. Add webhook URL:
   ```
   https://pxsutovdzppoyyfrbeaw.supabase.co/functions/v1/razorpay-webhook
   ```
4. Select events:
   - `payment.captured`
   - `payment.authorized`
5. Copy the webhook secret and add it as `RAZORPAY_WEBHOOK_SECRET` in Supabase

## 🧪 Testing

### ⚠️ Important: Indian Cards Only
Razorpay test mode **only accepts Indian cards**. International cards will show "international cards aren't eligible" error.

### Test Cards (Indian Only)

**Credit Cards:**
- Visa: `4111 1111 1111 1111` (CVV: any 3 digits, Expiry: any future date)
- Mastercard: `5555 5555 5555 4444` (CVV: any 3 digits, Expiry: any future date)

**Easiest Method - UPI:**
- UPI ID: `success@razorpay` (always succeeds)
- UPI ID: `failure@razorpay` (always fails - for error testing)

**Netbanking:**
- Select any bank from the list

### Test Flow
1. Go to Patient Dashboard → Billing
2. Click "Pay Online" on an unpaid invoice
3. **Select UPI** (easiest) or Card payment method
4. For UPI: Enter `success@razorpay`
5. For Card: Use Indian test card above
6. Complete test payment
7. Verify invoice status updates to "paid"

See `RAZORPAY_TEST_CARDS.md` for complete list of test cards.

## 🔒 Security Notes

- ✅ Key Secret is stored server-side only (Supabase secrets)
- ✅ Payment verification happens via webhook
- ✅ Order creation is server-side (prevents tampering)
- ✅ Webhook signature verification (if secret is set)

## 📝 Payment Flow

1. **Patient clicks "Pay Online"**
   - Frontend calls `create-razorpay-order` Edge Function
   - Function creates Razorpay order with invoice details

2. **Razorpay Checkout Opens**
   - Patient selects payment method (UPI/Card/Netbanking)
   - Completes payment

3. **Payment Success**
   - Razorpay sends webhook to `razorpay-webhook`
   - Webhook verifies payment and updates invoice
   - Invoice status changes to "paid"

4. **Patient Sees Confirmation**
   - Success message displayed
   - Invoice list refreshes automatically

## 🐛 Troubleshooting

### Payment not updating invoice
- Check Edge Function logs in Supabase Dashboard
- Verify webhook is configured correctly
- Check if invoice_id is in payment notes

### "Failed to create payment order"
- Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set
- Check Edge Function logs
- Verify invoice exists and is not already paid

### Webhook not receiving events
- Verify webhook URL is correct
- Check Razorpay Dashboard → Webhooks → Events
- Ensure webhook is active

## 🚀 Going Live

When ready for production:

1. **Get Live Keys**
   - Activate Razorpay account
   - Get live Key ID and Key Secret
   - Update Supabase secrets

2. **Update Environment**
   - Change `VITE_RAZORPAY_KEY_ID` to live key
   - Update Edge Function secrets

3. **Test Thoroughly**
   - Test with small amounts first
   - Verify all payment methods work
   - Test webhook delivery

## 📞 Support

- Razorpay Docs: https://razorpay.com/docs/
- Razorpay Support: support@razorpay.com

