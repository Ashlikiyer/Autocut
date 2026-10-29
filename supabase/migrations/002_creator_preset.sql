-- Allow the "creator" style in usage logs. Run once in the Supabase SQL editor.
alter table public.usage_logs drop constraint if exists usage_logs_preset_check;
alter table public.usage_logs
  add constraint usage_logs_preset_check
  check (preset in ('energetic', 'clean', 'funny', 'podcast', 'creator'));
