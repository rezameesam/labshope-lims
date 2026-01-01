#!/usr/bin/env python3
"""
Fix ON CONFLICT clauses to use correct unique constraints
Most tables use 'id' as primary key, so we'll use that
"""

import re
from pathlib import Path

def fix_conflict_clause(sql_content, table_name):
    """Fix ON CONFLICT to use 'id' (primary key) for all tables"""
    
    # Pattern to match INSERT ... ON CONFLICT ...
    # We'll replace with ON CONFLICT (id) DO NOTHING for safety
    
    # First, let's just use DO NOTHING on id for all tables
    # This is safer and will work for all tables with id as primary key
    
    # Find INSERT statements with ON CONFLICT
    pattern = r'(INSERT INTO public\.' + re.escape(table_name) + r'[^;]+?)\s+ON CONFLICT[^;]+;'
    
    def replace_conflict(match):
        insert_stmt = match.group(1)
        # Use simple DO NOTHING on id (primary key)
        return insert_stmt + ' ON CONFLICT (id) DO NOTHING;'
    
    # Replace all ON CONFLICT clauses
    modified_sql = re.sub(pattern, replace_conflict, sql_content, flags=re.IGNORECASE | re.DOTALL)
    
    # Also handle cases where there's no ON CONFLICT yet (shouldn't happen, but just in case)
    # Add ON CONFLICT if INSERT doesn't have it
    pattern_no_conflict = r'(INSERT INTO public\.' + re.escape(table_name) + r'[^;]+?);'
    
    def add_conflict(match):
        insert_stmt = match.group(1)
        if 'ON CONFLICT' not in insert_stmt.upper():
            return insert_stmt + ' ON CONFLICT (id) DO NOTHING;'
        return match.group(0)
    
    # Only add if not already present
    if 'ON CONFLICT' not in modified_sql.upper():
        modified_sql = re.sub(pattern_no_conflict, add_conflict, modified_sql, flags=re.IGNORECASE | re.DOTALL)
    
    return modified_sql

def process_file(file_path):
    """Process a single SQL file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract table name from file name
    table_name = file_path.stem.replace('_import', '')
    
    # Try to extract from INSERT statement
    match = re.search(r'INSERT INTO public\.(\w+)', content)
    if match:
        table_name = match.group(1)
    
    # Fix the conflict clause
    modified_content = fix_conflict_clause(content, table_name)
    
    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(modified_content)
    
    print(f"✅ Fixed: {file_path.name}")

def main():
    """Process all SQL files"""
    sql_imports_dir = Path('sql_imports')
    
    if not sql_imports_dir.exists():
        print("Error: sql_imports directory not found")
        return
    
    # Process all individual import files
    for sql_file in sql_imports_dir.glob('*_import.sql'):
        if sql_file.name != 'COMBINED_IMPORT_ALL.sql':
            process_file(sql_file)
    
    # Recreate combined file
    print("\n🔄 Recreating combined file...")
    
    # Import order
    IMPORT_ORDER = [
        'labs',
        'collection_centers',
        'doctors',
        'test_categories',
        'tests',
        'test_packages',
        'test_package_tests',
        'inventory_categories',
        'inventory_items',
        'custom_roles',
        'role_permissions',
        'user_roles',
        'user_custom_roles',
        'patients',
        'patient_tests',
        'patient_test_audit',
        'invoices',
        'invoice_items',
        'payments',
        'patient_reminders',
        'doctor_referrals',
        'inventory_purchases',
        'inventory_usage',
    ]
    
    combined_sql = []
    combined_sql.append("-- ========================================")
    combined_sql.append("-- Combined Import Script for Supabase")
    combined_sql.append("-- Import all data in correct dependency order")
    combined_sql.append("-- Handles duplicates with ON CONFLICT (id) DO NOTHING")
    combined_sql.append("-- ========================================")
    combined_sql.append("")
    combined_sql.append("-- IMPORTANT: Import employees separately after creating auth users!")
    combined_sql.append("-- See STEP_BY_STEP_IMPORT.md for details")
    combined_sql.append("")
    combined_sql.append("BEGIN;")
    combined_sql.append("")
    
    for table_name in IMPORT_ORDER:
        sql_file = sql_imports_dir / f"{table_name}_import.sql"
        if sql_file.exists():
            with open(sql_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    combined_sql.append(f"-- ========================================")
                    combined_sql.append(f"-- Importing {table_name}")
                    combined_sql.append(f"-- ========================================")
                    combined_sql.append("")
                    combined_sql.append(content)
                    combined_sql.append("")
    
    combined_sql.append("COMMIT;")
    combined_sql.append("")
    combined_sql.append("-- ========================================")
    combined_sql.append("-- Import Complete!")
    combined_sql.append("-- ========================================")
    
    output_file = sql_imports_dir / "COMBINED_IMPORT_ALL.sql"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(combined_sql))
    
    print(f"✅ Recreated: {output_file}")
    print("\n✅ All files updated to use ON CONFLICT (id) DO NOTHING!")

if __name__ == '__main__':
    main()

