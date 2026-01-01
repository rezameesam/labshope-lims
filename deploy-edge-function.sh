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
  MAILJET_API_KEY=cb79571d5659c6745f28f555dda16daa \
  MAILJET_SECRET_KEY=30b54ec068ada7245c6f20d5396acc9d \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"

echo "✅ Done! Edge Function deployed and secrets set."
echo ""
echo "Next steps:"
echo "1. Test email sending from Admin Dashboard → Notifications"
echo "2. Check Supabase Dashboard → Edge Functions → send-email to verify deployment"


