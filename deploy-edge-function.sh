#!/bin/bash

# Deploy Edge Function and Set Secrets via CLI
# Run this script to deploy the send-email Edge Function and set Mailjet secrets

echo "🚀 Deploying Edge Function and Setting Secrets..."

# Make sure you're logged in
echo "Checking login status..."
supabase login

# Deploy the Edge Function
echo "📦 Deploying send-email Edge Function..."
supabase functions deploy send-email

# Set Mailjet secrets
echo "🔐 Setting Mailjet secrets..."
supabase secrets set \
  MAILJET_API_KEY="${MAILJET_API_KEY:?set MAILJET_API_KEY in your shell first}" \
  MAILJET_SECRET_KEY="${MAILJET_SECRET_KEY:?set MAILJET_SECRET_KEY in your shell first}" \
  MAILJET_FROM_EMAIL=no-reply@labshope.com \
  MAILJET_FROM_NAME="LabShope LIMS"

echo "✅ Done! Edge Function deployed and secrets set."
echo ""
echo "Next steps:"
echo "1. Test email sending from Admin Dashboard → Notifications"
echo "2. Check Supabase Dashboard → Edge Functions → send-email to verify deployment"


