#!/usr/bin/env python3
"""
Create auth users and import employees from CSV
This script handles the user_id linking automatically
"""

import csv
import json
import sys
from pathlib import Path

def read_employees_csv(csv_file):
    """Read employees CSV and return list of employees"""
    employees = []
    
    with open(csv_file, 'r', encoding='utf-8') as f:
        # Detect delimiter
        sample = f.read(1024)
        f.seek(0)
        delimiter = ';' if ';' in sample else ','
        
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            if row.get('email'):
                employees.append({
                    'email': row.get('email', '').strip(),
                    'full_name': row.get('full_name', '').strip(),
                    'employee_id': row.get('employee_id', '').strip(),
                    'phone': row.get('phone', '').strip() or None,
                    'designation': row.get('designation', '').strip() or None,
                    'department': row.get('department', '').strip() or None,
                    'is_active': row.get('is_active', 'true').strip().lower() == 'true',
                    'lab_id': row.get('lab_id', '').strip() or None,
                })
    
    return employees

def generate_sql_import(employees, user_id_mapping):
    """Generate SQL to import employees with correct user_ids"""
    sql = "-- Import employees with linked auth users\n"
    sql += "-- Run this AFTER creating auth users\n\n"
    
    for emp in employees:
        email = emp['email']
        user_id = user_id_mapping.get(email, 'NULL')
        
        if user_id == 'NULL':
            print(f"⚠️  Warning: No user_id found for {email}, skipping...")
            continue
        
        sql += f"""INSERT INTO public.employees (
  user_id,
  employee_id,
  full_name,
  email,
  phone,
  designation,
  department,
  is_active,
  lab_id
) VALUES (
  '{user_id}',
  '{emp['employee_id']}',
  '{emp['full_name'].replace("'", "''")}',
  '{emp['email']}',
  {f"'{emp['phone']}'" if emp['phone'] else 'NULL'},
  {f"'{emp['designation'].replace("'", "''")}'" if emp['designation'] else 'NULL'},
  {f"'{emp['department'].replace("'", "''")}'" if emp['department'] else 'NULL'},
  {str(emp['is_active']).lower()},
  {f"'{emp['lab_id']}'" if emp['lab_id'] else 'NULL'}
) ON CONFLICT (employee_id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  designation = EXCLUDED.designation,
  department = EXCLUDED.department,
  is_active = EXCLUDED.is_active,
  lab_id = EXCLUDED.lab_id;

"""
    
    return sql

def generate_auth_user_instructions(employees):
    """Generate instructions for creating auth users"""
    instructions = "# Create Auth Users for Employees\n\n"
    instructions += "For each employee below, create an auth user in Supabase:\n\n"
    instructions += "1. Go to Supabase Dashboard → Authentication → Users → Add user\n"
    instructions += "2. For each employee:\n"
    instructions += "   - Email: [use email below]\n"
    instructions += "   - Password: Set a temporary password\n"
    instructions += "   - Auto Confirm User: ✅ Checked\n"
    instructions += "   - Click Create user\n"
    instructions += "   - Copy the User ID\n\n"
    instructions += "3. After creating all users, update the user_id_mapping.json file\n\n"
    instructions += "## Employees to Create:\n\n"
    
    for i, emp in enumerate(employees, 1):
        instructions += f"{i}. **{emp['full_name']}** ({emp['email']})\n"
        instructions += f"   - Employee ID: {emp['employee_id']}\n"
        instructions += f"   - Designation: {emp['designation'] or 'N/A'}\n"
        instructions += f"   - Department: {emp['department'] or 'N/A'}\n\n"
    
    return instructions

def main():
    """Main function"""
    if len(sys.argv) < 2:
        print("Usage: python create_employees_from_csv.py <employees_csv_file>")
        print("\nExample:")
        print("  python create_employees_from_csv.py ~/Downloads/Lovable_Data_Exported/employees-export-2025-12-31_20-31-39.csv")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    
    if not Path(csv_file).exists():
        print(f"Error: File not found: {csv_file}")
        sys.exit(1)
    
    print(f"Reading employees from {csv_file}...")
    employees = read_employees_csv(csv_file)
    
    print(f"Found {len(employees)} employees")
    
    # Generate instructions
    instructions = generate_auth_user_instructions(employees)
    with open('CREATE_AUTH_USERS_INSTRUCTIONS.md', 'w', encoding='utf-8') as f:
        f.write(instructions)
    print("✅ Created CREATE_AUTH_USERS_INSTRUCTIONS.md")
    
    # Create template for user_id mapping
    user_id_mapping = {emp['email']: '' for emp in employees}
    with open('user_id_mapping.json', 'w', encoding='utf-8') as f:
        json.dump(user_id_mapping, f, indent=2)
    print("✅ Created user_id_mapping.json template")
    
    print("\n📋 Next Steps:")
    print("1. Follow CREATE_AUTH_USERS_INSTRUCTIONS.md to create auth users")
    print("2. Update user_id_mapping.json with the User IDs from Supabase")
    print("3. Run this script again to generate the SQL import file")
    print("\nOr manually create auth users and update the mapping file, then run:")
    print("  python create_employees_from_csv.py <csv_file> --generate-sql")

if __name__ == '__main__':
    if '--generate-sql' in sys.argv:
        # Load user_id mapping
        if not Path('user_id_mapping.json').exists():
            print("Error: user_id_mapping.json not found. Run the script first without --generate-sql")
            sys.exit(1)
        
        with open('user_id_mapping.json', 'r', encoding='utf-8') as f:
            user_id_mapping = json.load(f)
        
        csv_file = [arg for arg in sys.argv if not arg.startswith('--')][1]
        employees = read_employees_csv(csv_file)
        
        sql = generate_sql_import(employees, user_id_mapping)
        with open('import_employees.sql', 'w', encoding='utf-8') as f:
            f.write(sql)
        print("✅ Generated import_employees.sql")
        print("\nTo import:")
        print("1. Go to Supabase Dashboard → SQL Editor")
        print("2. Copy and paste the contents of import_employees.sql")
        print("3. Click 'Run'")
    else:
        main()


