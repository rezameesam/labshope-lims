-- Realtime keeps polling the database for every table in this publication, around the clock, even when nobody
-- is connected (it was the single biggest consumer of database time). The app now refreshes these screens by
-- polling while the page is open, so nothing needs Realtime any more.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'platform_notifications') then
    alter publication supabase_realtime drop table public.platform_notifications;
  end if;
end $$;
