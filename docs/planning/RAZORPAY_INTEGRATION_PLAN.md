# Razorpay Integration Plan

## Overview
Integrate Razorpay payment gateway to enable online payments for invoices in the IRM Clinical Laboratory system.

## What We Need From You

### 1. Razorpay Account Credentials
- **Key ID** (Publishable Key) - Starts with `rzp_`
- **Key Secret** (Secret Key) - Starts with `rzp_`
- **Webhook Secret** - For verifying webhook signatures

### 2. Razorpay Account Setup
- ✅ Create account at https://razorpay.com
- ✅ Activate your account
- ✅ Get API keys from Dashboard → Settings → API Keys
- ✅ Set up webhook URL (we'll provide this after deployment)

## Integration Components

### 1. Frontend (React)
- ✅ Install Razorpay Checkout SDK
- ✅ Create payment button component
- ✅ Integrate with BillingPortal component
- ✅ Handle payment success/failure callbacks

### 2. Backend (Supabase Edge Functions)
- ✅ Create payment order (server-side for security)
- ✅ Verify payment webhook
- ✅ Update invoice status automatically

### 3. Database Updates
- ✅ Add Razorpay fields to payments table:
  - `razorpay_order_id`
  - `razorpay_payment_id`
  - `razorpay_signature`
  - `payment_status` (pending, success, failed)

## Payment Flow

1. **Patient clicks "Pay Online"** on invoice
2. **Frontend calls Edge Function** to create Razorpay order
3. **Razorpay Checkout opens** with payment options
4. **Patient completes payment** via UPI/Card/Netbanking
5. **Razorpay sends webhook** to our server
6. **Edge Function verifies payment** and updates invoice
7. **Patient sees success message** and invoice marked as paid

## Files to Create/Update

1. `package.json` - Add Razorpay SDK
2. `src/services/razorpayService.ts` - Payment service
3. `src/components/payment/RazorpayButton.tsx` - Payment button
4. `supabase/functions/create-razorpay-order/index.ts` - Create order
5. `supabase/functions/razorpay-webhook/index.ts` - Webhook handler
6. `supabase/migrations/xxxx_add_razorpay_fields.sql` - DB migration
7. Update `BillingPortal.tsx` - Add Razorpay option
8. Update `ManageBilling.tsx` - Add Razorpay option

## Security Considerations

- ✅ Never expose Key Secret in frontend
- ✅ All order creation on server-side
- ✅ Webhook signature verification
- ✅ Payment verification before updating invoice

## Next Steps

1. **You provide**: Razorpay Key ID and Key Secret
2. **I'll create**: All integration code
3. **You deploy**: Edge Functions to Supabase
4. **You configure**: Webhook URL in Razorpay Dashboard
5. **Test**: Payment flow end-to-end

---

**Ready to start?** Please provide:
- Razorpay Key ID
- Razorpay Key Secret
- (Optional) Test mode or Live mode preference

