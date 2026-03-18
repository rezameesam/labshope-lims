-- Platform notifications for admin portal
create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null default 'system',
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Index for fast unread queries
create index idx_platform_notifications_unread on public.platform_notifications (is_read, created_at desc)
  where is_read = false;

-- Index for listing
create index idx_platform_notifications_created on public.platform_notifications (created_at desc);

-- RLS
alter table public.platform_notifications enable row level security;

-- Platform admins can read all notifications
create policy "Platform admins can read notifications"
  on public.platform_notifications for select
  using (
    exists (
      select 1 from public.platform_admins
      where platform_admins.user_id = auth.uid()
    )
  );

-- Platform admins can insert notifications
create policy "Platform admins can insert notifications"
  on public.platform_notifications for insert
  with check (
    exists (
      select 1 from public.platform_admins
      where platform_admins.user_id = auth.uid()
    )
  );

-- Platform admins can update notifications (mark as read)
create policy "Platform admins can update notifications"
  on public.platform_notifications for update
  using (
    exists (
      select 1 from public.platform_admins
      where platform_admins.user_id = auth.uid()
    )
  );
