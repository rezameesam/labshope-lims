# Custom Roles & Permissions System

## Overview

The Custom Roles & Permissions system allows administrators to create custom roles with granular permissions. This provides fine-grained access control beyond the basic admin/employee/collector roles.

## Features

### 1. **Custom Role Creation**
- Create roles with custom names (e.g., "Lab Technician", "Billing Staff", "Receptionist")
- Add descriptions to explain the role's purpose
- Activate/deactivate roles without deleting them
- System roles (admin, employee, etc.) are protected and cannot be modified

### 2. **Granular Permissions**
40+ permissions organized into 12 categories:

#### Patient Management
- `view_patients` - View patient list and details
- `create_patients` - Register new patients
- `edit_patients` - Update patient information
- `delete_patients` - Remove patients

#### Test Management
- `view_tests` - View patient tests
- `create_tests` - Create new test orders
- `edit_tests` - Modify test information
- `delete_tests` - Remove tests
- `enter_test_results` - Enter test results
- `view_test_results` - View test results

#### Billing & Finance
- `view_billing` - View billing information
- `create_invoices` - Create invoices
- `edit_invoices` - Modify invoices
- `delete_invoices` - Delete invoices
- `process_payments` - Record payments
- `view_financial_reports` - Access financial reports

#### Inventory Management
- `view_inventory` - View inventory items
- `manage_inventory` - Add/edit/delete inventory
- `view_inventory_alerts` - See low stock alerts

#### Employee Management
- `view_employees` - View employee list
- `create_employees` - Add new employees
- `edit_employees` - Update employee info
- `delete_employees` - Remove employees
- `manage_roles` - Manage custom roles and permissions

#### Test Catalog
- `view_test_catalog` - View available tests
- `manage_test_catalog` - Add/edit/delete tests

#### Test Packages
- `view_test_packages` - View test packages
- `manage_test_packages` - Create/edit packages

#### Doctors
- `view_doctors` - View doctor list
- `manage_doctors` - Add/edit doctors

#### Reminders
- `view_reminders` - View patient reminders
- `manage_reminders` - Create/edit reminders

#### Reports & Analytics
- `view_reports` - View reports
- `export_reports` - Export reports to PDF/Excel

#### Labs & Collection Centers
- `view_labs` - View labs
- `manage_labs` - Create/edit labs
- `view_collection_centers` - View collection centers
- `manage_collection_centers` - Manage collection centers

#### System
- `manage_settings` - Access system settings
- `view_audit_logs` - View audit logs

### 3. **User Role Assignment**
- Users can have multiple custom roles
- Permissions are cumulative (user gets all permissions from all their roles)
- Admins automatically have all permissions

### 4. **Permission Checking**
- Database functions: `has_permission(user_id, permission)` and `get_user_permissions(user_id)`
- Can be used in RLS policies and application code

## Usage

### Accessing Role Management

1. Navigate to Admin Dashboard
2. Click on "Roles & Permissions" tab (admin-only)
3. View all existing custom roles

### Creating a New Role

1. Click "Create Role" button
2. Enter role name and description
3. Select permissions by category
4. Use "Select All" to quickly select all permissions in a category
5. Click "Create Role"

### Editing a Role

1. Click the edit icon (pencil) next to a role
2. Modify name, description, or status
3. Add or remove permissions
4. Click "Update Role"

### Assigning Roles to Users

Currently, roles can be assigned via SQL:
```sql
INSERT INTO public.user_custom_roles (user_id, role_id)
VALUES ('<user_id>', '<role_id>');
```

Future enhancement: Add UI to assign roles from the employee management page.

### Example Roles

**Lab Technician**
- Permissions: `view_patients`, `view_tests`, `create_tests`, `enter_test_results`, `view_test_results`, `view_test_catalog`

**Billing Staff**
- Permissions: `view_patients`, `view_billing`, `create_invoices`, `edit_invoices`, `process_payments`, `view_financial_reports`

**Receptionist**
- Permissions: `view_patients`, `create_patients`, `edit_patients`, `view_tests`, `create_tests`, `view_billing`, `create_invoices`

**Lab Manager**
- Permissions: All test-related, inventory, and reports permissions

## Database Schema

### Tables

1. **custom_roles**: Stores role definitions
2. **role_permissions**: Junction table linking roles to permissions
3. **user_custom_roles**: Junction table linking users to custom roles

### Functions

1. **has_permission(user_id, permission)**: Returns true if user has the permission
2. **get_user_permissions(user_id)**: Returns all permissions for a user

## Security

- Only admins can access the role management interface
- Only admins can create, edit, or delete custom roles
- System roles cannot be deleted or modified
- RLS policies ensure only admins can view/manage roles

## Future Enhancements

1. **UI for Role Assignment**: Add interface to assign roles to users from employee management
2. **Role Templates**: Pre-defined role templates for common positions
3. **Permission Groups**: Create permission groups for easier management
4. **Role Inheritance**: Allow roles to inherit permissions from other roles
5. **Time-Based Permissions**: Temporary permissions that expire
6. **Permission Audit**: Track who granted/revoked permissions
7. **Role-Based UI**: Show/hide UI elements based on permissions

## Migration

Run the migration file: `supabase/migrations/20251231000001_create_custom_roles.sql`

See `LOVABLE_MIGRATION_PROMPT.md` for the complete SQL.

