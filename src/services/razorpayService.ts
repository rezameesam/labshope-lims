/**
 * Razorpay Payment Service
 * Handles Razorpay payment integration on the frontend
 */

// Load Razorpay script dynamically
const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

interface RazorpayOptions {
  key: string;
  amount: number; // Amount in paise (e.g., 10000 = ₹100)
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  handler: (response: RazorpayResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, handler: () => void) => void;
    };
  }
}

/**
 * Initialize Razorpay payment
 */
export const initiateRazorpayPayment = async (
  keyId: string,
  orderId: string,
  amount: number,
  invoiceNumber: string,
  businessName?: string,
  patientName?: string,
  patientEmail?: string,
  patientPhone?: string,
  onSuccess?: (response: RazorpayResponse) => void,
  onError?: (error: string) => void
): Promise<void> => {
  try {
    // Load Razorpay script
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      throw new Error('Failed to load Razorpay checkout script');
    }

    if (!window.Razorpay) {
      throw new Error('Razorpay is not available');
    }

    if (!keyId) {
      throw new Error('Razorpay key is not configured');
    }

    const options: RazorpayOptions = {
      key: keyId,
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      name: businessName || 'Diagnostic Laboratory',
      description: `Payment for Invoice ${invoiceNumber}`,
      order_id: orderId,
      prefill: {
        name: patientName || '',
        email: patientEmail || '',
        contact: patientPhone || '',
      },
      handler: (response) => {
        if (onSuccess) {
          onSuccess(response);
        }
      },
      modal: {
        ondismiss: () => {
          if (onError) {
            onError('Payment cancelled by user');
          }
        },
      },
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();
  } catch (error: any) {
    console.error('Error initiating Razorpay payment:', error);
    if (onError) {
      onError(error.message || 'Failed to initiate payment');
    }
  }
};

/**
 * Verify payment signature (client-side basic check)
 * Full verification should be done on server via webhook
 */
export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string
): boolean => {
  // Note: Full signature verification should be done server-side
  // This is just a basic check
  return !!(orderId && paymentId && signature);
};
