#!/usr/bin/env python3
"""
Automated SQL Import Script for Supabase
Prepares SQL for execution and provides instructions
"""

import os
import sys
from pathlib import Path

def load_sql_file(file_path: str) -> str:
    """Load SQL file content"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def split_sql_statements(sql_content: str) -> list:
    """Split SQL content into individual statements"""
    # Remove comments and split by semicolons
    statements = []
    current_statement = []
    
    for line in sql_content.split('\n'):
        # Skip comment-only lines
        stripped = line.strip()
        if not stripped or stripped.startswith('--'):
            continue
        
        current_statement.append(line)
        
        # If line ends with semicolon, it's the end of a statement
        if stripped.endswith(';'):
            statement = '\n'.join(current_statement).strip()
            if statement:
                statements.append(statement)
            current_statement = []
    
    # Add any remaining statement
    if current_statement:
        statement = '\n'.join(current_statement).strip()
        if statement:
            statements.append(statement)
    
    return statements

def main():
    """Main function"""
    # Get Supabase credentials from environment or config
    supabase_url = os.getenv('SUPABASE_URL') or 'https://pxsutovdzppoyyfrbeaw.supabase.co'
    
    # Determine which SQL file to import
    sql_file = None
    if len(sys.argv) > 1:
        sql_file = sys.argv[1]
    else:
        # Default to combined import
        sql_file = 'sql_imports/COMBINED_IMPORT_ALL.sql'
    
    if not Path(sql_file).exists():
        print(f"❌ Error: SQL file not found: {sql_file}")
        sys.exit(1)
    
    print(f"📄 Loading SQL file: {sql_file}")
    sql_content = load_sql_file(sql_file)
    
    print(f"🔗 Supabase URL: {supabase_url}")
    print("✅ SQL file loaded successfully")
    print("\n⚠️  Note: Direct SQL execution via Python requires Supabase Management API.")
    print("   This script validates and prepares the SQL for execution.")
    print("\n📋 Recommended execution methods:")
    print("\n   1. Using Supabase Dashboard (Recommended - Easiest):")
    print(f"      ./import_data.sh {sql_file}")
    print("      (Script will open Dashboard with instructions)")
    print("\n   2. Using Supabase Dashboard:")
    print("      - Go to Supabase Dashboard → SQL Editor")
    print(f"      - Copy contents of {sql_file}")
    print("      - Paste and click 'Run'")
    print("\n   3. Using psql (if you have connection string):")
    print(f"      psql <connection_string> -f {sql_file}")
    
    # For now, just validate the SQL file
    statements = split_sql_statements(sql_content)
    print(f"\n✅ SQL file validated: {len(statements)} statements found")
    
    # Show first few statements as preview
    print("\n📝 Preview of first 3 statements:")
    for i, stmt in enumerate(statements[:3], 1):
        preview = stmt[:100].replace('\n', ' ')
        print(f"   {i}. {preview}...")
    
    if len(statements) > 3:
        print(f"   ... and {len(statements) - 3} more statements")
    
    print("\n💡 To execute the import:")
    print("   1. Use Supabase Dashboard SQL Editor (recommended)")
    print("   2. Or use Supabase CLI: supabase db execute --file <sql_file>")
    print("   3. Or use psql with connection string")

if __name__ == '__main__':
    main()

