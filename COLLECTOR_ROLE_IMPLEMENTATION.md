# Sample Collector Role Implementation

## Overview
A new "collector" role has been added to the system for staff members who are dedicated to sample collection and patient registration. Collectors can use the same login system as employees but have access to a simplified dashboard with limited features.

## Features

### 1. **New Role: "collector"**
- Added to the `app_role` enum in the database
- Collectors can have this role exclusively or in combination with other roles
- If a user has both collector and admin/employee roles, they get full admin access

### 2. **Collector Dashboard** (`/collector`)
A simplified dashboard with only essential features:
- **Overview**: Dashboard statistics
- **Patients**: Register new patients and view existing ones
- **Test Collection**: Create new tests and track sample collection

### 3. **Sample Collection Tracking**
- **`collected_by`**: Tracks which user collected the sample (UUID reference to auth.users)
- **`collected_at`**: Timestamp of when the sample was collected
- Automatically set when a collector creates a new test

### 4. **Access Control**
Collectors have permissions to:
- ✅ View and create patients
- ✅ View test catalog
- ✅ Create patient tests (with automatic collection tracking)
- ✅ View their own collected tests
- ✅ Update tests they collected
- ❌ Cannot enter test results (restricted to employees/admins)
- ❌ Cannot manage billing/invoices
- ❌ Cannot access inventory, employees, or other admin features

## Database Changes

### Migration: `20251231000000_add_collector_role.sql`
1. Adds `'collector'` to `app_role` enum
2. Adds `collected_by` and `collected_at` columns to `patient_tests` table
3. Creates RLS policies for collectors
4. Allows collectors to view/create patients and tests

## Code Changes

### 1. **Authentication Hook** (`src/hooks/useAuth.tsx`)
- Added `'collector'` to `UserRole` type
- Added `isCollector` property to identify pure collectors (not admins/employees)
- Updated `isStaff` to include collectors

### 2. **Collector Dashboard** (`src/pages/CollectorDashboard.tsx`)
- New simplified dashboard component
- Limited tabs: Overview, Patients, Test Collection
- Same login system as employees

### 3. **Routing** (`src/App.tsx`)
- Added `/collector` route
- Collectors are automatically redirected to collector dashboard

### 4. **Test Creation** (`src/components/admin/ManageTests.tsx`)
- Automatically sets `collected_by` and `collected_at` when creating tests
- Updated `PatientTest` interface to include collection fields

### 5. **Login Redirects**
- `EmployeeAuth.tsx`: Redirects collectors to `/collector`, others to `/admin`
- `AdminDashboard.tsx`: Redirects collectors to `/collector` if they access admin dashboard

## Usage

### Creating a Collector Account

1. **Option 1: Create as Employee with Collector Role**
   - Admin creates employee account
   - Admin assigns `'collector'` role via `user_roles` table
   - User logs in and is redirected to collector dashboard

2. **Option 2: Create Dedicated Collector**
   - Admin creates auth user
   - Admin assigns only `'collector'` role
   - User logs in and sees simplified collector interface

### SQL to Create Collector Role:
```sql
-- Add collector role to a user
INSERT INTO public.user_roles (user_id, role)
VALUES ('<user_id>', 'collector');
```

## Benefits

1. **Same Login System**: No need for separate authentication
2. **Simplified Interface**: Collectors see only what they need
3. **Sample Tracking**: Know exactly who collected each sample
4. **Flexible**: Employees can also have collector role if needed
5. **Secure**: RLS policies ensure collectors can only access what they need

## Future Enhancements

1. **Collection Center Assignment**: Assign collectors to specific collection centers
2. **Collection Statistics**: Track collection performance per collector
3. **Mobile App**: Dedicated mobile app for collectors on the go
4. **Barcode Scanning**: Scan patient IDs and test codes
5. **Offline Mode**: Work offline and sync when online

## Migration Instructions

Run the migration file in Lovable:
```sql
-- See: supabase/migrations/20251231000000_add_collector_role.sql
```

After migration:
1. Assign collector role to users via `user_roles` table
2. Users will automatically be redirected to collector dashboard on login
3. All new tests will track who collected the sample

