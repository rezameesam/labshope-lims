# Razorpay Test Cards (Indian Cards Only)

## ✅ Valid Indian Test Cards

Razorpay test mode **only accepts Indian cards**. Use these test cards:

### Credit Cards

**Visa:**
- Card Number: `4111 1111 1111 1111`
- CVV: Any 3 digits (e.g., `123`)
- Expiry: Any future date (e.g., `12/25`)
- Name: Any name

**Mastercard:**
- Card Number: `5555 5555 5555 4444`
- CVV: Any 3 digits (e.g., `123`)
- Expiry: Any future date (e.g., `12/25`)
- Name: Any name

**RuPay:**
- Card Number: `6074 8200 0000 0000`
- CVV: Any 3 digits
- Expiry: Any future date
- Name: Any name

### Debit Cards

**Visa Debit:**
- Card Number: `4012 0010 3714 1112`
- CVV: Any 3 digits
- Expiry: Any future date
- Name: Any name

### UPI (Easiest for Testing)

**Test UPI IDs:**
- `success@razorpay` - Always succeeds
- `failure@razorpay` - Always fails (for testing error handling)

### Netbanking

Select any bank from the list - all test banks will work.

### Wallets

- Any test wallet ID will work

## ❌ Cards That Won't Work

- International cards (Visa/Mastercard from outside India)
- American Express (unless specifically enabled)
- Cards starting with `4000` (often detected as international)

## 💡 Recommended Test Method

**For easiest testing, use UPI:**
1. Select "UPI" payment method
2. Enter: `success@razorpay`
3. Click "Pay"
4. Payment will succeed immediately

## 🔧 If You Need International Cards

International cards require:
1. Activation in Razorpay Dashboard
2. Terms & Conditions page
3. Privacy Policy page
4. Refund Policy page
5. Approval from Razorpay

For testing, stick with Indian test cards or UPI.

