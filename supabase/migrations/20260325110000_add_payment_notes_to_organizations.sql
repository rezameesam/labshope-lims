alter table public.organizations
  add column if not exists payment_notes text default null;
