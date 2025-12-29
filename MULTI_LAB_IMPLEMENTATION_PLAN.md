# Multi-Lab & Multi-Location Implementation Plan

## Overview
This document outlines the implementation plan for supporting multiple labs, branches, and collection centers in the IRM Clinic system.

## Architecture Changes Required

### 1. Database Schema Changes

#### New Tables Needed:
- `labs` - Main lab/branch information
- `collection_centers` - Collection center locations
- `lab_users` - User-lab associations (many-to-many)
- `lab_settings` - Lab-specific configurations

#### Tables to Modify:
- Add `lab_id` to: `patients`, `patient_tests`, `invoices`, `employees`, `inventory_items`, `doctors`, `test_packages`, `patient_reminders`
- Add `collection_center_id` to: `patients`, `patient_tests`

### 2. Key Features to Implement

#### A. Lab Management
- Create/edit/delete labs
- Lab settings (name, address, contact, logo, etc.)
- Lab-specific configurations
- Lab status (active/inactive)

#### B. Collection Center Management
- Create/edit/delete collection centers
- Link collection centers to labs
- Collection center settings
- Sample collection tracking

#### C. User-Lab Association
- Assign users to specific labs
- Multi-lab access for admins
- Lab switching functionality
- Role-based access per lab

#### D. Data Segregation
- RLS policies updated for lab-based filtering
- Lab-specific dashboards
- Cross-lab reporting (for admins)
- Lab-specific inventory

#### E. Reporting & Analytics
- Lab-specific reports
- Cross-lab comparison reports
- Collection center performance
- Lab-wise financial reports

## Implementation Steps

### Phase 1: Database Schema
1. Create migration for `labs` table
2. Create migration for `collection_centers` table
3. Create migration for `lab_users` table
4. Create migration for `lab_settings` table
5. Add `lab_id` columns to existing tables
6. Update RLS policies

### Phase 2: Core Components
1. Lab Management UI
2. Collection Center Management UI
3. Lab Selector Component
4. Lab Context Provider
5. Update all queries to include lab_id

### Phase 3: UI Updates
1. Add lab selector to admin dashboard
2. Update all forms to include lab selection
3. Lab-specific navigation
4. Lab branding support

### Phase 4: Features
1. Lab-specific inventory
2. Lab-specific test catalog
3. Lab-specific doctors
4. Lab-specific reports
5. Collection center assignment

### Phase 5: Advanced Features
1. Sample transfer between labs
2. Cross-lab patient lookup
3. Centralized admin dashboard
4. Lab performance comparison

## Database Schema

### Labs Table
```sql
CREATE TABLE public.labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('main', 'branch', 'collection_center')),
  parent_lab_id UUID REFERENCES public.labs(id),
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  settings JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Collection Centers Table
```sql
CREATE TABLE public.collection_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES public.labs(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Lab Users Table
```sql
CREATE TABLE public.lab_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lab_id UUID NOT NULL REFERENCES public.labs(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, lab_id)
);
```

## UI Components Needed

1. **LabSelector** - Dropdown/selector for switching labs
2. **LabManagement** - CRUD for labs
3. **CollectionCenterManagement** - CRUD for collection centers
4. **LabSettings** - Lab-specific configuration
5. **LabDashboard** - Lab-specific overview
6. **CrossLabReports** - Multi-lab analytics

## Migration Strategy

1. **Backward Compatibility**: Add `lab_id` as nullable initially
2. **Default Lab**: Create a default lab for existing data
3. **Data Migration**: Assign all existing data to default lab
4. **Gradual Rollout**: Enable multi-lab feature flag

## Considerations

1. **Data Isolation**: Ensure proper RLS policies
2. **Performance**: Index on `lab_id` columns
3. **User Experience**: Seamless lab switching
4. **Reporting**: Lab-specific vs cross-lab views
5. **Inventory**: Shared or per-lab inventory
6. **Test Catalog**: Shared or per-lab catalog
7. **Patients**: Shared across labs or per-lab

## Next Steps

1. Review and approve this plan
2. Create database migrations
3. Implement core components
4. Update existing components
5. Test multi-lab functionality
6. Deploy with feature flag

