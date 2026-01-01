#!/usr/bin/env python3
"""
Convert semicolon-delimited CSV files to SQL INSERT statements
Handles UUIDs, dates, and NULL values correctly
"""

import csv
import os
import sys
from pathlib import Path

def escape_sql_string(value):
    """Escape SQL string values"""
    if value is None or value == '':
        return 'NULL'
    # Replace single quotes with double single quotes
    return f"'{str(value).replace("'", "''")}'"

def format_value(value, column_name):
    """Format a value for SQL based on column type"""
    if value is None or value == '':
        return 'NULL'
    
    # UUID columns
    if 'id' in column_name.lower() and len(str(value)) == 36:
        return f"'{value}'"
    
    # Boolean columns
    if column_name.lower() in ['is_active', 'is_paid', 'is_completed']:
        if str(value).lower() in ['true', 't', '1', 'yes']:
            return 'true'
        elif str(value).lower() in ['false', 'f', '0', 'no']:
            return 'false'
        return 'NULL'
    
    # Date/timestamp columns
    if 'date' in column_name.lower() or 'created_at' in column_name.lower() or 'updated_at' in column_name.lower():
        if value:
            return f"'{value}'"
        return 'NULL'
    
    # Numeric columns (if they look like numbers)
    if column_name.lower() in ['amount', 'price', 'quantity', 'count']:
        try:
            float(value)
            return str(value)
        except:
            return escape_sql_string(value)
    
    # Default: treat as string
    return escape_sql_string(value)

def csv_to_sql(csv_file_path, table_name, skip_user_id=False):
    """Convert CSV to SQL INSERT statements"""
    sql_statements = []
    
    with open(csv_file_path, 'r', encoding='utf-8') as f:
        # Detect delimiter
        sample = f.read(1024)
        f.seek(0)
        delimiter = ';' if ';' in sample else ','
        
        reader = csv.DictReader(f, delimiter=delimiter)
        
        # Get column names
        columns = [col for col in reader.fieldnames if col]
        
        # Skip user_id if requested (for employees table)
        if skip_user_id and 'user_id' in columns:
            columns.remove('user_id')
        
        # Build INSERT statement
        values_list = []
        for row in reader:
            values = []
            for col in columns:
                value = row.get(col, '')
                formatted_value = format_value(value, col)
                values.append(formatted_value)
            
            values_str = ', '.join(values)
            values_list.append(f"({values_str})")
        
        if values_list:
            columns_str = ', '.join(columns)
            sql = f"INSERT INTO public.{table_name} ({columns_str}) VALUES\n"
            sql += ',\n'.join(values_list) + ';\n'
            sql_statements.append(sql)
    
    return '\n'.join(sql_statements)

def main():
    """Main function"""
    if len(sys.argv) < 2:
        print("Usage: python convert_csv_to_sql.py <csv_file> [table_name] [--skip-user-id]")
        print("\nExample:")
        print("  python convert_csv_to_sql.py employees.csv employees --skip-user-id")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    table_name = sys.argv[2] if len(sys.argv) > 2 else Path(csv_file).stem.replace('-export-', '_')
    skip_user_id = '--skip-user-id' in sys.argv
    
    if not os.path.exists(csv_file):
        print(f"Error: File not found: {csv_file}")
        sys.exit(1)
    
    print(f"Converting {csv_file} to SQL for table {table_name}...")
    sql = csv_to_sql(csv_file, table_name, skip_user_id)
    
    output_file = f"{table_name}_import.sql"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"-- Import script for {table_name}\n")
        f.write(f"-- Generated from {csv_file}\n\n")
        f.write(sql)
    
    print(f"✅ SQL file created: {output_file}")
    print(f"\nTo import:")
    print(f"1. Go to Supabase Dashboard → SQL Editor")
    print(f"2. Copy and paste the contents of {output_file}")
    print(f"3. Click 'Run'")

if __name__ == '__main__':
    main()


