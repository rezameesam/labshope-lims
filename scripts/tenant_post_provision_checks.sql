-- Replace this before running:
-- \set tenant_slug 'acme-diagnostics'

select id, slug, display_name, status, plan_code, primary_email, primary_phone
from public.organizations
where slug = :'tenant_slug';

select organization_id, domain, is_primary
from public.organization_domains
where organization_id = (
  select id from public.organizations where slug = :'tenant_slug'
)
order by domain;

select id, organization_id, lab_code, name, type, is_active, email, phone
from public.labs
where organization_id = (
  select id from public.organizations where slug = :'tenant_slug'
)
order by created_at;

select user_id, role, is_active, is_primary
from public.organization_users
where organization_id = (
  select id from public.organizations where slug = :'tenant_slug'
)
order by created_at;

select lu.user_id, lu.lab_id, lu.role, lu.is_active, lu.is_primary
from public.lab_users lu
join public.labs l on l.id = lu.lab_id
where l.organization_id = (
  select id from public.organizations where slug = :'tenant_slug'
)
order by lu.created_at;

select id, organization_id, employee_id, full_name, email, is_active
from public.employees
where organization_id = (
  select id from public.organizations where slug = :'tenant_slug'
)
order by created_at;

select setting_key,
       case when coalesce(setting_value, '') <> '' then 'configured' else 'empty' end as status
from public.organization_settings
where organization_id = (
  select id from public.organizations where slug = :'tenant_slug'
)
  and setting_key in (
    'organization_website',
    'branding_tagline',
    'branding_description',
    'report_tagline',
    'report_footer_note',
    'email_from_name',
    'email_from_email',
    'email_reply_to',
    'razorpay_key_id',
    'razorpay_key_secret',
    'razorpay_webhook_secret',
    'whatsapp_access_token',
    'whatsapp_phone_number_id',
    'whatsapp_verify_token',
    'whatsapp_app_secret'
  )
order by setting_key;
