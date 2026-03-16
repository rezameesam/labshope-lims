alter table public.platform_onboarding_requests
  add column if not exists resolved_slug text,
  add column if not exists resolved_domain text,
  add column if not exists provisioned_organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists provisioned_lab_id uuid references public.labs(id) on delete set null,
  add column if not exists provisioned_owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists provisioned_by uuid references auth.users(id) on delete set null,
  add column if not exists provisioned_at timestamp with time zone,
  add column if not exists provisioning_error text;

create index if not exists idx_platform_onboarding_requests_provisioned_org
  on public.platform_onboarding_requests (provisioned_organization_id);

create index if not exists idx_platform_onboarding_requests_provisioned_at
  on public.platform_onboarding_requests (provisioned_at desc);
