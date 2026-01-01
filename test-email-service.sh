#!/bin/bash

# Test Email Service Configuration

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔍 Testing Email Service Configuration${NC}"
echo ""

PROJECT_REF="pxsutovdzppoyyfrbeaw"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Check if secrets are set
echo -e "${YELLOW}Checking Edge Function secrets...${NC}"
echo ""

if command -v supabase &> /dev/null; then
    echo "Listing secrets:"
    supabase secrets list 2>/dev/null || echo "⚠️  Could not list secrets (may need to be linked)"
    echo ""
else
    echo -e "${YELLOW}⚠️  Supabase CLI not found. Check secrets manually in Dashboard.${NC}"
    echo ""
fi

echo -e "${GREEN}Required secrets for Mailjet:${NC}"
echo "  - MAILJET_API_KEY"
echo "  - MAILJET_SECRET_KEY"
echo "  - MAILJET_FROM_EMAIL (optional)"
echo "  - MAILJET_FROM_NAME (optional)"
echo ""

echo -e "${YELLOW}To set secrets:${NC}"
echo "  1. Using CLI: ./set-email-secrets.sh"
echo "  2. Or manually: Supabase Dashboard → Settings → Edge Functions → Secrets"
echo ""

echo -e "${GREEN}Testing Edge Function...${NC}"
echo ""

# Test the Edge Function
read -p "Enter your email to test: " test_email

if [ -z "$test_email" ]; then
    echo -e "${RED}No email provided. Exiting.${NC}"
    exit 1
fi

echo ""
echo "Calling Edge Function..."

# Get anon key from env or prompt
ANON_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_FBGkelHPPulufbpPPDbSRA_OqyUCSul}"

response=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/send-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"to\": \"${test_email}\",
    \"subject\": \"Test Email\",
    \"htmlContent\": \"<h1>Test Email</h1><p>This is a test email from IRM Clinic.</p>\"
  }")

echo ""
echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

if echo "$response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Email sent successfully!${NC}"
else
    echo -e "${RED}❌ Email failed. Check the error above.${NC}"
    echo ""
    echo "Common issues:"
    echo "  1. Secrets not set → Run ./set-email-secrets.sh"
    echo "  2. Wrong API keys → Check Mailjet account"
    echo "  3. Edge Function not deployed → Deploy send-email function"
fi

