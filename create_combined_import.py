#!/usr/bin/env python3
"""
Combine all SQL import files into one master file
This works in Supabase SQL Editor (no \i commands needed)
"""

from pathlib import Path

# Import order - tables with no dependencies first
IMPORT_ORDER = [
    # Phase 1: Base tables (no dependencies)
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
    
    # Phase 2: User accounts (after employees are imported)
    'user_roles',
    'user_custom_roles',
    
    # Phase 3: Patient data
    'patients',
    
    # Phase 4: Test data
    'patient_tests',
    'patient_test_audit',
    
    # Phase 5: Billing data
    'invoices',
    'invoice_items',
    'payments',
    
    # Phase 6: Other data
    'patient_reminders',
    'doctor_referrals',
    'inventory_purchases',
    'inventory_usage',
]

def main():
    """Combine all SQL files into one"""
    sql_imports_dir = Path('sql_imports')
    
    if not sql_imports_dir.exists():
        print("Error: sql_imports directory not found")
        return
    
    combined_sql = []
    combined_sql.append("-- ========================================")
    combined_sql.append("-- Combined Import Script for Supabase")
    combined_sql.append("-- Import all data in correct dependency order")
    combined_sql.append("-- ========================================")
    combined_sql.append("")
    combined_sql.append("-- IMPORTANT: Import employees separately after creating auth users!")
    combined_sql.append("-- See STEP_BY_STEP_IMPORT.md for details")
    combined_sql.append("")
    combined_sql.append("BEGIN;")
    combined_sql.append("")
    
    successful = []
    failed = []
    
    for table_name in IMPORT_ORDER:
        sql_file = sql_imports_dir / f"{table_name}_import.sql"
        
        if sql_file.exists():
            print(f"Adding {table_name}...")
            with open(sql_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    combined_sql.append(f"-- ========================================")
                    combined_sql.append(f"-- Importing {table_name}")
                    combined_sql.append(f"-- ========================================")
                    combined_sql.append("")
                    combined_sql.append(content)
                    combined_sql.append("")
                    successful.append(table_name)
        else:
            print(f"⚠️  File not found: {sql_file}")
            failed.append(table_name)
    
    combined_sql.append("COMMIT;")
    combined_sql.append("")
    combined_sql.append("-- ========================================")
    combined_sql.append("-- Import Complete!")
    combined_sql.append("-- ========================================")
    
    # Write combined file
    output_file = sql_imports_dir / "COMBINED_IMPORT_ALL.sql"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(combined_sql))
    
    print(f"\n✅ Created: {output_file}")
    print(f"   - Successfully combined: {len(successful)} tables")
    if failed:
        print(f"   - Skipped (not found): {len(failed)} tables")
    print(f"\n📋 To use:")
    print(f"   1. Open {output_file}")
    print(f"   2. Copy all contents")
    print(f"   3. Paste into Supabase SQL Editor")
    print(f"   4. Click 'Run'")
    print(f"\n⚠️  Remember: Import employees separately after creating auth users!")

if __name__ == '__main__':
    main()

