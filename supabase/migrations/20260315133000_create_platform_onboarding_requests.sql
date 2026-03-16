create table if not exists public.platform_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  status text not null default 'new',
  selected_plan text not null,
  setup_mode text not null,
  organization_name text not null,
  primary_lab_name text,
  owner_full_name text not null,
  owner_email text not null,
  owner_phone text not null,
  city text,
  branch_count integer not null default 1,
  preferred_subdomain text,
  go_live_target date,
  needs_data_import boolean not null default false,
  needs_white_label boolean not null default false,
  notes text,
  hostname text,
  page_path text,
  referer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  constraint platform_onboarding_requests_status_check
    check (status in ('new', 'reviewing', 'approved', 'closed')),
  constraint platform_onboarding_requests_plan_check
    check (selected_plan in ('starter', 'growth', 'premium')),
  constraint platform_onboarding_requests_setup_mode_check
    check (setup_mode in ('self_serve', 'assisted')),
  constraint platform_onboarding_requests_branch_count_check
    check (branch_count between 1 and 999)
);

create index if not exists idx_platform_onboarding_requests_created_at
  on public.platform_onboarding_requests (created_at desc);

create index if not exists idx_platform_onboarding_requests_status
  on public.platform_onboarding_requests (status);

create index if not exists idx_platform_onboarding_requests_plan
  on public.platform_onboarding_requests (selected_plan);

alter table public.platform_onboarding_requests enable row level security;

drop policy if exists "Platform admins can view onboarding requests" on public.platform_onboarding_requests;
create policy "Platform admins can view onboarding requests"
  on public.platform_onboarding_requests
  for select
  using (public.is_platform_admin(auth.uid()));

drop policy if exists "Platform admins can update onboarding requests" on public.platform_onboarding_requests;
create policy "Platform admins can update onboarding requests"
  on public.platform_onboarding_requests
  for update
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop trigger if exists update_platform_onboarding_requests_updated_at on public.platform_onboarding_requests;
create trigger update_platform_onboarding_requests_updated_at
before update on public.platform_onboarding_requests
for each row execute function public.update_updated_at_column();
