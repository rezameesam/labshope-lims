-- Enable realtime for platform notifications so the bell updates live
alter publication supabase_realtime add table public.platform_notifications;
