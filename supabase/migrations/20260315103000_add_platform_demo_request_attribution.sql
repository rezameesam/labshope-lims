alter table public.platform_demo_requests
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists gclid text,
  add column if not exists fbclid text;

create index if not exists idx_platform_demo_requests_utm_source
  on public.platform_demo_requests (utm_source);

create index if not exists idx_platform_demo_requests_utm_campaign
  on public.platform_demo_requests (utm_campaign);
