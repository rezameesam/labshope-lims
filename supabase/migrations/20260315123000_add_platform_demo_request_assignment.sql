alter table public.platform_demo_requests
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists next_follow_up_at timestamptz;

create index if not exists idx_platform_demo_requests_assigned_to
  on public.platform_demo_requests (assigned_to);

create index if not exists idx_platform_demo_requests_next_follow_up_at
  on public.platform_demo_requests (next_follow_up_at);

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

  if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is not null then
      new.assigned_at := now();
    else
      new.assigned_at := null;
    end if;
  end if;

  return new;
end;
$$;
