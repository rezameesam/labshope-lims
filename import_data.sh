#!/bin/bash

# Automated SQL Import Script for Supabase
# Executes the combined SQL import script using psql

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default SQL file
SQL_FILE="${1:-sql_imports/COMBINED_IMPORT_ALL.sql}"

echo -e "${GREEN}🚀 Starting SQL Import Process${NC}"
echo ""

# Check if SQL file exists
if [ ! -f "$SQL_FILE" ]; then
    echo -e "${RED}❌ Error: SQL file not found: $SQL_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}📄 SQL File: $SQL_FILE${NC}"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Error: Supabase CLI not found${NC}"
    echo ""
    echo "Install it with:"
    echo "  brew install supabase/tap/supabase"
    echo "  or"
    echo "  npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI found${NC}"

# Check if linked to project
echo ""
echo -e "${YELLOW}🔍 Checking Supabase project connection...${NC}"

# Try to get project status
if supabase status &> /dev/null; then
    echo -e "${GREEN}✅ Connected to Supabase project${NC}"
else
    echo -e "${YELLOW}⚠️  Not connected to local project${NC}"
    echo ""
    echo "This script will execute SQL against your linked Supabase project."
    echo "Make sure you're linked:"
    echo "  supabase link --project-ref pxsutovdzppoyyfrbeaw"
fi

PROJECT_REF="pxsutovdzppoyyfrbeaw"
DASHBOARD_URL="https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"

echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: This will execute SQL against your database!${NC}"
echo ""
echo -e "${GREEN}📋 Recommended Method: Supabase Dashboard (Easiest)${NC}"
echo ""
echo "  1. Open: $DASHBOARD_URL"
echo "  2. Copy contents of: $SQL_FILE"
echo "  3. Paste into SQL Editor"
echo "  4. Click 'Run'"
echo ""
echo -e "${YELLOW}Alternative: Use psql (requires database password)${NC}"
echo ""
read -p "Do you want to use psql? (yes/no, default=no): " use_psql

if [ "$use_psql" != "yes" ]; then
    echo ""
    echo -e "${GREEN}✅ Opening instructions for Dashboard method...${NC}"
    echo ""
    echo "📝 Quick Steps:"
    echo "  1. Open this file: $SQL_FILE"
    echo "  2. Copy ALL contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)"
    echo "  3. Go to: $DASHBOARD_URL"
    echo "  4. Paste into SQL Editor (Cmd/Ctrl + V)"
    echo "  5. Click 'Run' button"
    echo ""
    
    # Try to open the file and dashboard URL (macOS)
    if command -v open &> /dev/null; then
        echo "Opening SQL file and Dashboard..."
        open "$SQL_FILE" 2>/dev/null || true
        open "$DASHBOARD_URL" 2>/dev/null || true
    fi
    
    exit 0
fi

# psql method
echo ""
echo -e "${GREEN}📤 Using psql method...${NC}"
echo ""

# Get database connection details
DB_PASSWORD="${SUPABASE_DB_PASSWORD}"
DB_HOST="${SUPABASE_DB_HOST:-db.${PROJECT_REF}.supabase.co}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres.${PROJECT_REF}}"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql (PostgreSQL client) not found${NC}"
    echo ""
    echo "Install PostgreSQL client:"
    echo "  brew install postgresql"
    echo ""
    echo -e "${YELLOW}Falling back to Dashboard method...${NC}"
    echo "  Go to: $DASHBOARD_URL"
    exit 1
fi

# Check if we have database password
if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}⚠️  Database password required${NC}"
    echo ""
    echo "Get it from: Supabase Dashboard → Settings → Database → Connection string"
    echo ""
    read -sp "Enter database password: " DB_PASSWORD
    echo ""
    
    if [ -z "$DB_PASSWORD" ]; then
        echo -e "${YELLOW}❌ No password provided. Use Dashboard method instead.${NC}"
        echo "  Go to: $DASHBOARD_URL"
        exit 0
    fi
fi

echo -e "${GREEN}🔗 Connecting to database...${NC}"

# Execute SQL using psql
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_FILE" --set=sslmode=require 2>&1; then
    echo ""
    echo -e "${GREEN}✅ SQL import completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify data in Supabase Dashboard"
    echo "  2. Import employees (if not already done)"
    echo "  3. Import user_roles (if not already done)"
else
    echo ""
    echo -e "${RED}❌ SQL import failed${NC}"
    echo ""
    echo "Check the error messages above."
    echo "Common issues:"
    echo "  - Foreign key constraints (import in correct order)"
    echo "  - Duplicate keys (data already exists)"
    echo "  - Missing dependencies (create auth users first)"
    echo "  - Incorrect password or connection details"
    echo ""
    echo -e "${YELLOW}Try Dashboard method instead:${NC}"
    echo "  Go to: $DASHBOARD_URL"
    exit 1
fi

