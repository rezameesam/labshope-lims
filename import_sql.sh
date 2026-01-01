#!/bin/bash

# Simple SQL Import Helper
# Opens SQL file and provides Dashboard URL

SQL_FILE="${1:-sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql}"
PROJECT_REF="pxsutovdzppoyyfrbeaw"
DASHBOARD_URL="https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"

echo "═══════════════════════════════════════════════════════════"
echo "  SQL Import Helper"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📄 SQL File: $SQL_FILE"
echo ""
echo "📋 Steps to Import:"
echo ""
echo "  1. Open the SQL file:"
echo "     $SQL_FILE"
echo ""
echo "  2. Copy ALL contents:"
echo "     • Select All: Cmd+A (Mac) or Ctrl+A (Windows/Linux)"
echo "     • Copy: Cmd+C (Mac) or Ctrl+C (Windows/Linux)"
echo ""
echo "  3. Open Supabase Dashboard:"
echo "     $DASHBOARD_URL"
echo ""
echo "  4. Paste and Run:"
echo "     • Paste: Cmd+V (Mac) or Ctrl+V (Windows/Linux)"
echo "     • Click 'Run' button"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if file exists
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Error: SQL file not found: $SQL_FILE"
    exit 1
fi

# Get file size
FILE_SIZE=$(wc -l < "$SQL_FILE")
echo "✅ SQL file found ($FILE_SIZE lines)"
echo ""

# Try to open file and dashboard (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Opening SQL file and Dashboard..."
    open "$SQL_FILE" 2>/dev/null || echo "  (Could not open file automatically)"
    open "$DASHBOARD_URL" 2>/dev/null || echo "  (Could not open Dashboard automatically)"
    echo ""
    echo "✅ Files opened in your browser/editor"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Opening SQL file and Dashboard..."
    xdg-open "$SQL_FILE" 2>/dev/null || echo "  (Could not open file automatically)"
    xdg-open "$DASHBOARD_URL" 2>/dev/null || echo "  (Could not open Dashboard automatically)"
    echo ""
    echo "✅ Files opened in your browser/editor"
else
    echo "💡 Tip: Open the SQL file and Dashboard manually using the URLs above"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Ready to import! Follow the steps above."
echo "═══════════════════════════════════════════════════════════"

