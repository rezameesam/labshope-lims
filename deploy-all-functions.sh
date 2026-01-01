#!/bin/bash

# Deploy all Edge Functions to Supabase

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Deploying All Edge Functions${NC}"
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
echo -e "${GREEN}📤 Deploying functions...${NC}"
echo ""

# Deploy create-first-admin
echo -e "${YELLOW}1. Deploying create-first-admin...${NC}"
if supabase functions deploy create-first-admin; then
    echo -e "${GREEN}   ✅ create-first-admin deployed${NC}"
else
    echo -e "${RED}   ❌ create-first-admin failed${NC}"
    exit 1
fi

echo ""

# Deploy create-employee
echo -e "${YELLOW}2. Deploying create-employee...${NC}"
if supabase functions deploy create-employee; then
    echo -e "${GREEN}   ✅ create-employee deployed${NC}"
else
    echo -e "${RED}   ❌ create-employee failed${NC}"
    exit 1
fi

echo ""

# Deploy send-email (re-deploy to ensure it's up to date)
echo -e "${YELLOW}3. Deploying send-email...${NC}"
if supabase functions deploy send-email; then
    echo -e "${GREEN}   ✅ send-email deployed${NC}"
else
    echo -e "${RED}   ❌ send-email failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All functions deployed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify in Supabase Dashboard → Edge Functions"
echo "  2. Set secrets if needed (see DEPLOY_ALL_EDGE_FUNCTIONS.md)"
echo "  3. Test functions using the Dashboard"

