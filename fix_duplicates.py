#!/usr/bin/env python3
"""
Fix SQL import files to handle duplicates with ON CONFLICT
"""

import re
from pathlib import Path

def add_conflict_handling(sql_content, table_name):
    """Add ON CONFLICT DO NOTHING or DO UPDATE to INSERT statements"""
    
    # Find the INSERT statement
    # Pattern: INSERT INTO public.table_name (...) VALUES (...);
    
    # Get the primary key or unique constraint column name
    # For most tables, it's 'id', but some have unique constraints on other columns
    
    # Common unique constraints by table
    unique_constraints = {
        'labs': 'lab_code',
        'collection_centers': 'code',
        'doctors': None,  # Use id
        'test_categories': None,
        'tests': None,
        'test_packages': None,
        'test_package_tests': None,
        'inventory_categories': None,
        'inventory_items': None,
        'custom_roles': None,
        'role_permissions': None,
        'user_roles': None,
        'user_custom_roles': None,
        'patients': 'patient_id',
        'patient_tests': None,
        'patient_test_audit': None,
        'invoices': None,
        'invoice_items': None,
        'payments': None,
        'patient_reminders': None,
        'doctor_referrals': None,
        'inventory_purchases': None,
        'inventory_usage': None,
    }
    
    # Default to 'id' if not specified
    conflict_column = unique_constraints.get(table_name, 'id')
    
    # Pattern to match INSERT INTO ... VALUES ...;
    pattern = r'(INSERT INTO public\.' + re.escape(table_name) + r'[^;]+);'
    
    def replace_insert(match):
        insert_stmt = match.group(1)
        
        # Add ON CONFLICT clause
        if conflict_column:
            # Use DO UPDATE to update existing records, or DO NOTHING to skip
            # DO UPDATE is safer as it ensures data is current
            conflict_clause = f" ON CONFLICT ({conflict_column}) DO UPDATE SET\n"
            
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
                    conflict_clause += ',\n'.join(set_clauses)
                else:
                    # If only conflict column, just do nothing
                    conflict_clause = f" ON CONFLICT ({conflict_column}) DO NOTHING"
            else:
                conflict_clause = f" ON CONFLICT ({conflict_column}) DO NOTHING"
        else:
            conflict_clause = " ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id"
        
        return insert_stmt + conflict_clause + ';'
    
    # Replace all INSERT statements
    modified_sql = re.sub(pattern, replace_insert, sql_content, flags=re.IGNORECASE | re.DOTALL)
    
    return modified_sql

def process_file(file_path):
    """Process a single SQL file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract table name from file name or content
    table_name = file_path.stem.replace('_import', '')
    
    # Try to extract from INSERT statement if not found
    match = re.search(r'INSERT INTO public\.(\w+)', content)
    if match:
        table_name = match.group(1)
    
    # Add conflict handling
    modified_content = add_conflict_handling(content, table_name)
    
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
    
    from create_combined_import import IMPORT_ORDER
    combined_sql = []
    combined_sql.append("-- ========================================")
    combined_sql.append("-- Combined Import Script for Supabase")
    combined_sql.append("-- Import all data in correct dependency order")
    combined_sql.append("-- Handles duplicates with ON CONFLICT")
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
    print("\n✅ All files updated to handle duplicates!")

if __name__ == '__main__':
    main()

