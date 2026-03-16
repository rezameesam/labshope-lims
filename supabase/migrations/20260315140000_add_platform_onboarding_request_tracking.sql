alter table public.platform_onboarding_requests
  add column if not exists status_notes text,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamp with time zone,
  add column if not exists next_follow_up_at timestamp with time zone,
  add column if not exists reviewing_at timestamp with time zone,
  add column if not exists approved_at timestamp with time zone,
  add column if not exists closed_at timestamp with time zone;

create index if not exists idx_platform_onboarding_requests_assigned_to
  on public.platform_onboarding_requests (assigned_to);

create index if not exists idx_platform_onboarding_requests_next_follow_up_at
  on public.platform_onboarding_requests (next_follow_up_at);

create or replace function public.set_platform_onboarding_request_tracking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status = 'reviewing' and old.reviewing_at is null then
        new.reviewing_at := now();
      elsif new.status = 'approved' and old.approved_at is null then
        new.approved_at := now();
      elsif new.status = 'closed' and old.closed_at is null then
        new.closed_at := now();
      end if;
    end if;

    if new.assigned_to is distinct from old.assigned_to then
      if new.assigned_to is null then
        new.assigned_at := null;
      else
        new.assigned_at := now();
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_platform_onboarding_requests_tracking on public.platform_onboarding_requests;
create trigger trg_platform_onboarding_requests_tracking
before update on public.platform_onboarding_requests
for each row execute function public.set_platform_onboarding_request_tracking();
