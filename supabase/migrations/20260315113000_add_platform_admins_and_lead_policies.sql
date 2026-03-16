create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  note text
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = _user_id
  );
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated;

drop policy if exists "Platform admins can view own membership" on public.platform_admins;
create policy "Platform admins can view own membership"
on public.platform_admins
for select
using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));

drop policy if exists "Platform admins can view demo requests" on public.platform_demo_requests;
create policy "Platform admins can view demo requests"
on public.platform_demo_requests
for select
using (public.is_platform_admin(auth.uid()));

drop policy if exists "Platform admins can update demo requests" on public.platform_demo_requests;
create policy "Platform admins can update demo requests"
on public.platform_demo_requests
for update
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

with earliest_admin as (
  select ur.user_id
  from public.user_roles ur
  join auth.users au on au.id = ur.user_id
  where ur.role = 'admin'
    and ur.user_id is not null
  order by au.created_at asc nulls first, ur.user_id asc
  limit 1
)
insert into public.platform_admins (user_id, created_by, note)
select ea.user_id, ea.user_id, 'Backfilled earliest admin during platform admin rollout'
from earliest_admin ea
where not exists (
  select 1 from public.platform_admins
)
on conflict (user_id) do nothing;
