#!/usr/bin/env python3
"""Remove duplicate active user_custom_roles INSERT statement"""

file_path = 'sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql'

with open(file_path, 'r') as f:
    lines = f.readlines()

# Find the duplicate section (after line 510 where comment block ends)
new_lines = []
skip_until_section_end = False
found_duplicate_section = False

for i, line in enumerate(lines, 1):
    # Detect start of duplicate section (after the comment block)
    if i > 510 and '-- Import script for user_custom_roles' in line and not found_duplicate_section:
        found_duplicate_section = True
        skip_until_section_end = True
        continue  # Skip this line
    
    # Skip lines in duplicate section until we hit the next section
    if skip_until_section_end:
        if line.strip().startswith('-- ========================================') and 'Importing patients' in lines[min(i, len(lines)-1)]:
            skip_until_section_end = False
            new_lines.append(line)
            continue
        else:
            continue  # Skip this line
    
    new_lines.append(line)

# Write fixed file
with open(file_path, 'w') as f:
    f.writelines(new_lines)

print(f"✅ Fixed: Removed duplicate user_custom_roles INSERT")
print(f"   Original: {len(lines)} lines")
print(f"   Fixed: {len(new_lines)} lines")

# Verify no active user_custom_roles INSERT remains
with open(file_path, 'r') as f:
    content = f.read()
    active_inserts = [i+1 for i, line in enumerate(content.split('\n')) if 'INSERT INTO public.user_custom_roles' in line and not line.strip().startswith('--')]
    
    if active_inserts:
        print(f"⚠️  Warning: Found {len(active_inserts)} active INSERT statements at lines: {active_inserts}")
    else:
        print(f"✅ Verified: No active user_custom_roles INSERT statements found")

