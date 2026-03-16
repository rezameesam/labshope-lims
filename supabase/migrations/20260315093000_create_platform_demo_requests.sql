create table if not exists public.platform_demo_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  lab_name text not null,
  email text not null,
  phone text not null,
  city text,
  branch_count integer,
  notes text,
  source text not null default 'website',
  status text not null default 'new',
  hostname text,
  page_path text,
  referer text
);

create index if not exists idx_platform_demo_requests_created_at
  on public.platform_demo_requests (created_at desc);

create index if not exists idx_platform_demo_requests_status
  on public.platform_demo_requests (status);

alter table public.platform_demo_requests enable row level security;
