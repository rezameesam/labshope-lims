-- Multi-tenant staging spot checks
-- Run after deploy and again after staging smoke tests.

-- 1) Null organization ownership in core tables should be zero or explicitly understood.
select 'patients' as table_name, count(*) as null_org_rows from public.patients where organization_id is null
union all
select 'patient_tests', count(*) from public.patient_tests where organization_id is null
union all
select 'invoices', count(*) from public.invoices where organization_id is null
union all
select 'invoice_items', count(*) from public.invoice_items where organization_id is null
union all
select 'payments', count(*) from public.payments where organization_id is null
union all
select 'billing_audit', count(*) from public.billing_audit where organization_id is null
union all
select 'visitor_logs', count(*) from public.visitor_logs where organization_id is null
union all
select 'whatsapp_webhook_events', count(*) from public.whatsapp_webhook_events where organization_id is null;

-- 2) Confirm latest org-aware policies exist on critical tables.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in (
    'payments',
    'invoice_items',
    'billing_audit',
    'visitor_logs',
    'whatsapp_webhook_events',
    'booking_requests',
    'patient_reminders',
    'labs',
    'collection_centers',
    'quotations',
    'quotation_items'
  )
order by tablename, policyname;

-- 3) Confirm latest org-scoped unique indexes exist.
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'labs_organization_id_lab_code_key',
    'idx_invoices_org_invoice_number',
    'idx_quotations_org_quotation_number',
    'idx_patients_org_patient_id',
    'idx_employees_org_employee_id',
    'idx_patients_org_username'
  )
order by tablename, indexname;

-- 4) Confirm organization domains exist for staging tenants.
select o.slug, d.domain, d.is_primary, d.verified_at
from public.organizations o
left join public.organization_domains d on d.organization_id = o.id
order by o.slug, d.domain;

-- 5) Confirm tenant-specific overrides exist where expected.
select
  o.slug,
  os.setting_key,
  case when coalesce(os.setting_value, '') <> '' then 'configured' else 'empty' end as status
from public.organization_settings os
join public.organizations o on o.id = os.organization_id
where os.setting_key in (
  'email_from_name',
  'email_from_email',
  'email_reply_to',
  'organization_website',
  'razorpay_key_id',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  'whatsapp_access_token',
  'whatsapp_phone_number_id',
  'whatsapp_verify_token',
  'whatsapp_app_secret'
)
order by o.slug, os.setting_key;

-- 6) Show invoice numbering per organization.
select o.slug, min(i.invoice_number) as first_invoice, max(i.invoice_number) as last_invoice, count(*) as invoice_count
from public.invoices i
join public.organizations o on o.id = i.organization_id
group by o.slug
order by o.slug;

-- 7) Show patient and employee identifier reuse risk by organization.
select o.slug, count(*) as patient_count, count(distinct p.patient_id) as distinct_patient_ids, count(distinct p.username) as distinct_usernames
from public.organizations o
left join public.patients p on p.organization_id = o.id
group by o.slug
order by o.slug;

select o.slug, count(*) as employee_count, count(distinct e.employee_id) as distinct_employee_ids
from public.organizations o
left join public.employees e on e.organization_id = o.id
group by o.slug
order by o.slug;

-- 8) Show recent root-site demo leads captured from the platform site.
select created_at, updated_at, contacted_at, qualified_at, closed_at, assigned_to, assigned_at, next_follow_up_at, full_name, lab_name, email, phone, status, hostname, page_path, status_notes
from public.platform_demo_requests
order by created_at desc
limit 20;

-- 9) Confirm platform admin bootstrap and demo-lead policies.
select pa.user_id, e.email, pa.created_at, pa.note
from public.platform_admins pa
left join public.employees e on e.user_id = pa.user_id
order by pa.created_at asc;

select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('platform_admins', 'platform_demo_requests')
order by tablename, policyname;

-- 10) Show onboarding queue state and provisioning results.
select
  created_at,
  updated_at,
  reviewing_at,
  approved_at,
  closed_at,
  assigned_to,
  assigned_at,
  next_follow_up_at,
  organization_name,
  owner_email,
  selected_plan,
  setup_mode,
  status,
  resolved_slug,
  resolved_domain,
  provisioned_organization_id,
  provisioned_lab_id,
  provisioned_owner_user_id,
  provisioned_at,
  provisioning_error
from public.platform_onboarding_requests
order by created_at desc
limit 20;
