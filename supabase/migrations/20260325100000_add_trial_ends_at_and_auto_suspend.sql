-- Add trial_ends_at to organizations
alter table public.organizations
  add column if not exists trial_ends_at timestamptz default null;

-- Back-fill: any org currently in 'trial' with no trial_ends_at gets 14 days from now
update public.organizations
set trial_ends_at = now() + interval '14 days'
where status = 'trial'
  and trial_ends_at is null;

-- Enable pg_cron extension (must be enabled in Supabase dashboard on Pro plans;
-- on free plans this will fail silently — use the Dashboard Cron UI instead)
create extension if not exists pg_cron with schema extensions;

-- Schedule a daily job at midnight IST (18:30 UTC) to auto-suspend expired trials
select cron.schedule(
  'auto-suspend-expired-trials',
  '30 18 * * *',
  $$
    update public.organizations
    set
      status     = 'suspended',
      updated_at = now()
    where status        = 'trial'
      and trial_ends_at is not null
      and trial_ends_at < now();
  $$
);
