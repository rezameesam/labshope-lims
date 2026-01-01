#!/usr/bin/env python3
"""
Fix foreign key issues by using DO UPDATE for tables that are referenced by others
This ensures IDs match even when conflicts occur
"""

import re
from pathlib import Path

# Tables that are referenced by others - need DO UPDATE to preserve IDs
REFERENCED_TABLES = {
    'labs': 'lab_code',  # Referenced by collection_centers, patients, etc.
    'patients': 'patient_id',  # Referenced by patient_tests, invoices
    'invoices': 'invoice_number',  # Referenced by invoice_items, payments
    'test_categories': 'name',  # Referenced by tests
}

def fix_referenced_table(sql_content, table_name, conflict_column):
    """Fix ON CONFLICT to use DO UPDATE for referenced tables"""
    
    # Pattern to match INSERT ... ON CONFLICT ... DO NOTHING
    pattern = r'(INSERT INTO public\.' + re.escape(table_name) + r'[^;]+?)\s+ON CONFLICT[^;]+DO NOTHING;'
    
    def replace_with_update(match):
        insert_stmt = match.group(1)
        
        # Extract column names from INSERT statement
        col_match = re.search(r'INSERT INTO public\.' + re.escape(table_name) + r'\s*\(([^)]+)\)', insert_stmt)
        if col_match:
            columns = [col.strip() for col in col_match.group(1).split(',')]
            # Build SET clause excluding the conflict column
            set_clauses = []
            for col in columns:
                if col != conflict_column:
                    set_clauses.append(f"  {col} = EXCLUDED.{col}")
            
            if set_clauses:
                update_clause = f' ON CONFLICT ({conflict_column}) DO UPDATE SET\n' + ',\n'.join(set_clauses) + ';'
            else:
                # If only conflict column, just do nothing
                update_clause = f' ON CONFLICT ({conflict_column}) DO NOTHING;'
        else:
            update_clause = f' ON CONFLICT ({conflict_column}) DO NOTHING;'
        
        return insert_stmt + update_clause
    
    # Replace all ON CONFLICT DO NOTHING with DO UPDATE
    modified_sql = re.sub(pattern, replace_with_update, sql_content, flags=re.IGNORECASE | re.DOTALL)
    
    return modified_sql

def process_file(file_path):
    """Process a single SQL file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract table name
    table_name = file_path.stem.replace('_import', '')
    match = re.search(r'INSERT INTO public\.(\w+)', content)
    if match:
        table_name = match.group(1)
    
    # Check if this table is referenced by others
    if table_name in REFERENCED_TABLES:
        conflict_column = REFERENCED_TABLES[table_name]
        print(f"🔧 Fixing {table_name} (referenced by others, using DO UPDATE on {conflict_column})")
        content = fix_referenced_table(content, table_name, conflict_column)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ Fixed: {file_path.name}")
    else:
        print(f"⏭️  Skipped: {file_path.name} (not referenced by others)")

def main():
    """Process all SQL files"""
    sql_imports_dir = Path('sql_imports')
    
    if not sql_imports_dir.exists():
        print("Error: sql_imports directory not found")
        return
    
    # Process referenced tables
    for table_name in REFERENCED_TABLES:
        sql_file = sql_imports_dir / f"{table_name}_import.sql"
        if sql_file.exists():
            process_file(sql_file)
    
    # Recreate combined file
    print("\n🔄 Recreating combined file...")
    
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
    combined_sql.append("-- Handles duplicates with ON CONFLICT")
    combined_sql.append("-- Referenced tables use DO UPDATE to preserve IDs")
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

if __name__ == '__main__':
    main()

