-- Count the free daily limit per browser instead of per IP, so people who
-- share an internet connection don't use up each other's videos.
-- Run once in the Supabase SQL editor. Safe to run again.
alter table public.usage_logs add column if not exists visitor_hash text;

create index if not exists usage_logs_visitor_recent
  on public.usage_logs (visitor_hash, created_at desc);
