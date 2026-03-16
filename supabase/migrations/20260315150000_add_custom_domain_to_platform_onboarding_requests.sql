alter table public.platform_onboarding_requests
  add column if not exists custom_domain text,
  add column if not exists resolved_access_domain text;

create index if not exists idx_platform_onboarding_requests_custom_domain
  on public.platform_onboarding_requests (custom_domain);
