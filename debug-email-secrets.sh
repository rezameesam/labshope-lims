#!/bin/bash

# Debug Email Service Secrets

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔍 Debugging Email Service Secrets${NC}"
echo ""

PROJECT_REF="pxsutovdzppoyyfrbeaw"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
ANON_KEY="sb_publishable_FBGkelHPPulufbpPPDbSRA_OqyUCSul"

echo -e "${YELLOW}1. Checking secrets are set...${NC}"
if command -v supabase &> /dev/null; then
    supabase secrets list | grep -i mailjet || echo "⚠️  No Mailjet secrets found"
else
    echo "⚠️  Supabase CLI not available"
fi

echo ""
echo -e "${YELLOW}2. Testing Edge Function directly...${NC}"
echo ""

# Test the function
response=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/send-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d '{
    "to": "test@example.com",
    "subject": "Debug Test",
    "htmlContent": "<h1>Test</h1>"
  }')

echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"

echo ""
echo -e "${YELLOW}3. Checking Edge Function logs...${NC}"
echo "Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/functions/send-email/logs"
echo ""

echo -e "${YELLOW}4. Possible issues:${NC}"
echo "  - Secrets need more time to propagate (wait 2-3 minutes)"
echo "  - Edge Function needs to be restarted"
echo "  - Secrets might not be accessible to the function"
echo ""

echo -e "${GREEN}5. Try these fixes:${NC}"
echo ""
echo "  A. Wait 2-3 minutes and test again"
echo ""
echo "  B. Redeploy the function:"
echo "     supabase functions deploy send-email"
echo ""
echo "  C. Check function code matches local:"
echo "     Compare Dashboard code with supabase/functions/send-email/index.ts"
echo ""
echo "  D. Verify secrets in Dashboard:"
echo "     Settings → Edge Functions → Secrets"
echo "     Should see MAILJET_API_KEY and MAILJET_SECRET_KEY"

