#!/usr/bin/env python3
"""
Convert all CSV files from Lovable export to SQL INSERT statements
Handles semicolon delimiters and generates import scripts in correct order
"""

import csv
import os
from pathlib import Path

# Import order - tables with no dependencies first
IMPORT_ORDER = [
    # Phase 1: Base tables (no dependencies)
    ('labs', 'labs'),
    ('collection_centers', 'collection_centers'),
    ('doctors', 'doctors'),
    ('test_categories', 'test_categories'),
    ('tests', 'tests'),
    ('test_packages', 'test_packages'),
    ('test_package_tests', 'test_package_tests'),
    ('test_templates', 'test_templates'),
    ('inventory_categories', 'inventory_categories'),
    ('inventory_items', 'inventory_items'),
    ('custom_roles', 'custom_roles'),
    ('role_permissions', 'role_permissions'),
    
    # Phase 2: User accounts (after employees are imported)
    ('user_roles', 'user_roles'),
    ('user_custom_roles', 'user_custom_roles'),
    
    # Phase 3: Patient data
    ('profiles', 'profiles'),
    ('patients', 'patients'),
    
    # Phase 4: Test data
    ('patient_tests', 'patient_tests'),
    ('patient_test_audit', 'patient_test_audit'),
    
    # Phase 5: Billing data
    ('quotations', 'quotations'),
    ('quotation_items', 'quotation_items'),
    ('invoices', 'invoices'),
    ('invoice_items', 'invoice_items'),
    ('payments', 'payments'),
    
    # Phase 6: Other data
    ('patient_reminders', 'patient_reminders'),
    ('doctor_referrals', 'doctor_referrals'),
    ('inventory_purchases', 'inventory_purchases'),
    ('inventory_usage', 'inventory_usage'),
    ('equipment_maintenance', 'equipment_maintenance'),
    ('lab_settings', 'lab_settings'),
    ('lab_users', 'lab_users'),
]

def escape_sql_string(value):
    """Escape SQL string values"""
    if value is None or value == '':
        return 'NULL'
    return f"'{str(value).replace("'", "''")}'"

def format_value(value, column_name):
    """Format a value for SQL based on column type"""
    if value is None or value == '':
        return 'NULL'
    
    # UUID columns
    if 'id' in column_name.lower() and len(str(value)) == 36 and '-' in str(value):
        return f"'{value}'"
    
    # Boolean columns
    if column_name.lower() in ['is_active', 'is_paid', 'is_completed', 'is_verified']:
        if str(value).lower() in ['true', 't', '1', 'yes']:
            return 'true'
        elif str(value).lower() in ['false', 'f', '0', 'no']:
            return 'false'
        return 'NULL'
    
    # Date/timestamp columns
    if any(keyword in column_name.lower() for keyword in ['date', 'created_at', 'updated_at', 'timestamp']):
        if value:
            return f"'{value}'"
        return 'NULL'
    
    # Numeric columns
    if column_name.lower() in ['amount', 'price', 'quantity', 'count', 'total', 'discount', 'tax']:
        try:
            float(value)
            return str(value)
        except:
            return escape_sql_string(value)
    
    # Default: treat as string
    return escape_sql_string(value)

def csv_to_sql(csv_file_path, table_name):
    """Convert CSV to SQL INSERT statements"""
    if not os.path.exists(csv_file_path):
        return None, f"File not found: {csv_file_path}"
    
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as f:
            # Detect delimiter
            sample = f.read(1024)
            f.seek(0)
            delimiter = ';' if ';' in sample else ','
            
            reader = csv.DictReader(f, delimiter=delimiter)
            
            # Get column names (filter out empty)
            columns = [col.strip() for col in reader.fieldnames if col and col.strip()]
            
            if not columns:
                return None, "No columns found in CSV"
            
            # Build INSERT statement
            values_list = []
            row_count = 0
            
            for row in reader:
                values = []
                for col in columns:
                    value = row.get(col, '').strip() if col in row else ''
                    formatted_value = format_value(value, col)
                    values.append(formatted_value)
                
                values_str = ', '.join(values)
                values_list.append(f"({values_str})")
                row_count += 1
            
            if not values_list:
                return None, "No data rows found in CSV"
            
            columns_str = ', '.join(columns)
            sql = f"-- Import script for {table_name}\n"
            sql += f"-- Generated from {os.path.basename(csv_file_path)}\n"
            sql += f"-- Rows: {row_count}\n\n"
            sql += f"INSERT INTO public.{table_name} ({columns_str}) VALUES\n"
            sql += ',\n'.join(values_list) + ';\n'
            
            return sql, None
    except Exception as e:
        return None, str(e)

def find_csv_file(base_dir, table_name):
    """Find CSV file for a table name"""
    base_dir = Path(base_dir)
    patterns = [
        f"{table_name}-export-*.csv",
        f"{table_name}.csv",
    ]
    
    for pattern in patterns:
        matches = list(base_dir.glob(pattern))
        if matches:
            return matches[0]
    
    return None

def main():
    """Main function"""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python convert_all_csvs.py <csv_directory>")
        print("\nExample:")
        print("  python convert_all_csvs.py ~/Downloads/Lovable_Data_Exported")
        sys.exit(1)
    
    csv_dir = sys.argv[1]
    
    if not os.path.isdir(csv_dir):
        print(f"Error: Directory not found: {csv_dir}")
        sys.exit(1)
    
    print(f"Converting CSV files from {csv_dir}...\n")
    
    # Create output directory
    output_dir = Path("sql_imports")
    output_dir.mkdir(exist_ok=True)
    
    # Generate SQL for each table in order
    successful = []
    failed = []
    skipped = []
    
    for table_name, sql_table_name in IMPORT_ORDER:
        csv_file = find_csv_file(csv_dir, table_name)
        
        if not csv_file:
            skipped.append(table_name)
            continue
        
        print(f"Converting {table_name}...", end=' ')
        sql, error = csv_to_sql(csv_file, sql_table_name)
        
        if error:
            print(f"❌ Error: {error}")
            failed.append((table_name, error))
        elif sql:
            output_file = output_dir / f"{sql_table_name}_import.sql"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(sql)
            print(f"✅ {output_file}")
            successful.append(table_name)
        else:
            print("⚠️  No data")
            skipped.append(table_name)
    
    # Generate master import script
    master_script = output_dir / "00_IMPORT_ALL.sql"
    with open(master_script, 'w', encoding='utf-8') as f:
        f.write("-- Master Import Script\n")
        f.write("-- Import tables in this order to avoid foreign key errors\n\n")
        f.write("-- IMPORTANT: Import employees separately after creating auth users!\n")
        f.write("-- See CREATE_AUTH_USERS_INSTRUCTIONS.md\n\n")
        
        for table_name, sql_table_name in IMPORT_ORDER:
            sql_file = output_dir / f"{sql_table_name}_import.sql"
            if sql_file.exists():
                f.write(f"\\i {sql_file}\n")
    
    print(f"\n✅ Master script: {master_script}")
    print(f"\n📊 Summary:")
    print(f"  ✅ Successful: {len(successful)}")
    print(f"  ⚠️  Skipped: {len(skipped)}")
    print(f"  ❌ Failed: {len(failed)}")
    
    if successful:
        print(f"\n✅ Generated SQL files in {output_dir}/")
        print(f"   Import in order using the master script or individual files")
    
    if skipped:
        print(f"\n⚠️  Skipped tables (files not found): {', '.join(skipped)}")
    
    if failed:
        print(f"\n❌ Failed tables:")
        for table, error in failed:
            print(f"   - {table}: {error}")

if __name__ == '__main__':
    main()

