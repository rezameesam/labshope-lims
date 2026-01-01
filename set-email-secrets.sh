#!/bin/bash

# Set Email Service Secrets for Supabase Edge Function

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔐 Setting Email Service Secrets${NC}"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Error: Supabase CLI not found${NC}"
    echo ""
    echo "Install it with:"
    echo "  brew install supabase/tap/supabase"
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI found${NC}"
echo ""

# Check if linked
PROJECT_REF="pxsutovdzppoyyfrbeaw"
echo -e "${YELLOW}🔍 Checking project link...${NC}"
if ! supabase status &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not linked. Linking now...${NC}"
    supabase link --project-ref "$PROJECT_REF"
fi

echo ""
echo -e "${GREEN}📤 Setting Mailjet secrets...${NC}"
echo ""

# Set Mailjet secrets
if supabase secrets set \
  MAILJET_API_KEY=cb79571d5659c6745f28f555dda16daa \
  MAILJET_SECRET_KEY=30b54ec068ada7245c6f20d5396acc9d \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"; then
    echo ""
    echo -e "${GREEN}✅ Secrets set successfully!${NC}"
    echo ""
    echo "Verifying secrets..."
    supabase secrets list
    echo ""
    echo -e "${YELLOW}🔄 Redeploying Edge Function to pick up new secrets...${NC}"
    if supabase functions deploy send-email; then
        echo -e "${GREEN}✅ Edge Function redeployed!${NC}"
    else
        echo -e "${YELLOW}⚠️  Redeploy failed, but secrets are set. Try redeploying manually.${NC}"
    fi
    echo ""
    echo -e "${GREEN}✅ Email service should now work!${NC}"
    echo ""
    echo "Wait 30 seconds for secrets to propagate, then:"
    echo "  1. Test email in Admin Dashboard → Notifications"
    echo "  2. Or test Edge Function directly in Supabase Dashboard"
else
    echo ""
    echo -e "${RED}❌ Failed to set secrets${NC}"
    echo ""
    echo "Try setting them manually in Supabase Dashboard:"
    echo "  Settings → Edge Functions → Secrets"
    exit 1
fi

