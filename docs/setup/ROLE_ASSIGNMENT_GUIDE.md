# Role Assignment Guide

## Overview

The IRM Clinic system supports **37 granular permissions** organized into **12 categories**, allowing for fine-grained access control. Users can have **multiple custom roles**, and permissions are **cumulative** (users get all permissions from all their assigned roles).

---

## Available Permissions (37 Total)

### 1. **Patient Management** (4 permissions)
- View Patients
- Create Patients
- Edit Patients
- Delete Patients

### 2. **Test Management** (6 permissions)
- View Tests
- Create Tests
- Edit Tests
- Delete Tests
- Enter Test Results
- View Test Results

### 3. **Billing & Finance** (6 permissions)
- View Billing
- Create Invoices
- Edit Invoices
- Delete Invoices
- Process Payments
- View Financial Reports

### 4. **Inventory** (3 permissions)
- View Inventory
- Manage Inventory
- View Inventory Alerts

### 5. **Employee Management** (5 permissions)
- View Employees
- Create Employees
- Edit Employees
- Delete Employees
- Manage Roles

### 6. **Test Catalog** (2 permissions)
- View Test Catalog
- Manage Test Catalog

### 7. **Test Packages** (2 permissions)
- View Test Packages
- Manage Test Packages

### 8. **Doctors** (2 permissions)
- View Doctors
- Manage Doctors

### 9. **Reminders** (2 permissions)
- View Reminders
- Manage Reminders

### 10. **Reports & Analytics** (2 permissions)
- View Reports
- Export Reports

### 11. **Labs & Collection Centers** (4 permissions)
- View Labs
- Manage Labs
- View Collection Centers
- Manage Collection Centers

### 12. **System** (2 permissions)
- Manage Settings
- View Audit Logs

---

## Multiple Roles Support

✅ **Yes, users can have multiple custom roles!**

- Each user can be assigned **multiple custom roles** simultaneously
- Permissions from all assigned roles are **combined** (cumulative)
- For example, if a user has:
  - Role A: `view_patients`, `create_patients`
  - Role B: `view_tests`, `enter_test_results`
  
  Then the user will have **all four permissions**: `view_patients`, `create_patients`, `view_tests`, `enter_test_results`

---

## How to Assign Roles to Employees

### Step 1: Create Custom Roles
1. Navigate to **Admin Dashboard**
2. Click on **"Roles & Permissions"** tab
3. Click **"Create Role"** button
4. Enter role name and description
5. Select permissions by category
6. Click **"Create Role"**

### Step 2: Assign Roles to Employees
1. Navigate to **Admin Dashboard**
2. Click on **"Employees"** tab
3. Find the employee you want to assign roles to
4. Click the **three dots (⋮)** menu next to the employee
5. Click **"View Details"**
6. In the Employee Details sheet, scroll to the **"Custom Roles"** section
7. Click **"Manage Roles"** button
8. Check/uncheck the roles you want to assign
9. Click **"Save Roles"**

---

## Where to Manage Roles

### 1. **Create/Edit Roles**
- **Location**: Admin Dashboard → Roles & Permissions tab
- **Access**: Admin only
- **Actions**: Create, edit, delete, activate/deactivate roles

### 2. **Assign Roles to Employees**
- **Location**: Admin Dashboard → Employees tab → View Details → Manage Roles
- **Access**: Admin only
- **Actions**: Assign/remove multiple custom roles to employees

### 3. **View Employee Roles**
- **Location**: Admin Dashboard → Employees tab → View Details
- **Access**: Admin only
- **Shows**: All custom roles assigned to the employee (displayed as badges)

---

## Basic System Roles

In addition to custom roles, the system has **3 basic roles**:

1. **Admin** - Full system access (automatically has all permissions)
2. **Employee** - Standard employee access
3. **Collector** - Sample collection staff

These are assigned during employee creation and cannot be modified through the custom roles system.

---

## Best Practices

1. **Start with broad roles** and refine permissions as needed
2. **Use descriptive role names** (e.g., "Lab Technician", "Billing Staff")
3. **Document roles** in the description field
4. **Test permissions** by assigning roles to a test user
5. **Review role assignments regularly** to ensure they match job requirements
6. **Use multiple roles** when an employee has responsibilities across different areas

---

## Example Use Cases

### Example 1: Lab Technician
- **Custom Role**: "Lab Technician"
- **Permissions**: View Patients, View Tests, Create Tests, Enter Test Results, View Test Results, View Test Catalog
- **Result**: Can manage test workflow but cannot access billing

### Example 2: Multi-Role Employee
- **Employee**: Sarah (Receptionist who also handles billing)
- **Role 1**: "Receptionist" (View/Create Patients, View/Create Tests)
- **Role 2**: "Billing Staff" (View Billing, Create/Edit Invoices, Process Payments)
- **Result**: Sarah has all permissions from both roles combined

### Example 3: Lab Manager
- **Custom Role**: "Lab Manager"
- **Permissions**: All test-related, inventory, and reports permissions
- **Result**: Full control over lab operations without admin access

---

## Troubleshooting

### "No custom roles available"
- **Solution**: Create roles first in the "Roles & Permissions" section

### "Failed to update roles"
- **Solution**: Check that you have admin permissions and the database migration has been run

### "User doesn't have expected permissions"
- **Solution**: 
  1. Check which roles are assigned to the user
  2. Verify the roles have the correct permissions
  3. Remember that permissions are cumulative across all roles

---

## Database Schema

- **`custom_roles`**: Stores role definitions
- **`role_permissions`**: Links roles to permissions (many-to-many)
- **`user_custom_roles`**: Links users to custom roles (many-to-many, supports multiple roles per user)

---

## Need Help?

Refer to:
- `ROLE_SUGGESTIONS.md` - Suggested role names and descriptions
- `CUSTOM_ROLES_DOCUMENTATION.md` - Technical documentation
- Admin Dashboard → Roles & Permissions → View existing roles for examples

