-- Platform audit log for tracking admin actions
create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Index for filtering by action
create index idx_audit_log_action on public.platform_audit_log (action, created_at desc);

-- Index for filtering by entity
create index idx_audit_log_entity on public.platform_audit_log (entity_type, entity_id, created_at desc);

-- Index for listing
create index idx_audit_log_created on public.platform_audit_log (created_at desc);

-- RLS
alter table public.platform_audit_log enable row level security;

-- Platform admins can read all audit logs
create policy "Platform admins can read audit logs"
  on public.platform_audit_log for select
  using (
    exists (
      select 1 from public.platform_admins
      where platform_admins.user_id = auth.uid()
    )
  );

-- Platform admins can insert audit logs
create policy "Platform admins can insert audit logs"
  on public.platform_audit_log for insert
  with check (
    exists (
      select 1 from public.platform_admins
      where platform_admins.user_id = auth.uid()
    )
  );
