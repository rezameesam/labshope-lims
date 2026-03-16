alter table public.platform_demo_requests
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists contacted_at timestamptz,
  add column if not exists qualified_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists status_notes text;

create index if not exists idx_platform_demo_requests_updated_at
  on public.platform_demo_requests (updated_at desc);

create or replace function public.set_platform_demo_request_tracking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'contacted' and new.contacted_at is null then
      new.contacted_at := now();
    elsif new.status = 'qualified' and new.qualified_at is null then
      new.qualified_at := now();
    elsif new.status = 'closed' and new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_platform_demo_requests_tracking on public.platform_demo_requests;
create trigger trg_platform_demo_requests_tracking
before update on public.platform_demo_requests
for each row
execute function public.set_platform_demo_request_tracking();
