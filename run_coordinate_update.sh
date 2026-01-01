#!/bin/bash

# Script to help update lab coordinates
# This will open the SQL file and Supabase Dashboard

SQL_FILE="update_irm_lab_coordinates.sql"
DASHBOARD_URL="https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/sql/new"

echo "📍 IRM Clinical Laboratory Coordinate Update"
echo ""
echo "Coordinates to update:"
echo "   Latitude: 34.0166941"
echo "   Longitude: 74.7182231"
echo ""
echo "📝 Steps:"
echo "  1. The SQL file will open: $SQL_FILE"
echo "  2. Copy ALL contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)"
echo "  3. The Supabase Dashboard will open"
echo "  4. Paste the SQL (Cmd/Ctrl + V)"
echo "  5. Click 'Run' button"
echo ""

# Open SQL file and Dashboard (macOS)
if command -v open &> /dev/null; then
    echo "Opening SQL file and Dashboard..."
    open "$SQL_FILE" 2>/dev/null || true
    sleep 1
    open "$DASHBOARD_URL" 2>/dev/null || true
    echo ""
    echo "✅ Files opened! Follow the steps above."
else
    echo "Please manually:"
    echo "  1. Open: $SQL_FILE"
    echo "  2. Go to: $DASHBOARD_URL"
fi

