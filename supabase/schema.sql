-- AutoCut database schema. Run once in the Supabase SQL editor.
-- Stores only usage, accounts and feedback, never videos or transcripts.

-- profiles: optional sign-in, linked to Supabase Auth
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  daily_limit int not null default 10,
  created_at timestamptz not null default now()
);

-- usage_logs: one row per processed video
create table if not exists public.usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  ip_hash text not null,
  duration_sec numeric not null,
  preset text not null
    check (preset in ('energetic', 'clean', 'funny', 'podcast', 'creator')),
  status text not null default 'started'
    check (status in ('started', 'transcribed', 'planned', 'rendered', 'failed')),
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_ip_recent
  on public.usage_logs (ip_hash, created_at desc);
create index if not exists usage_logs_user_recent
  on public.usage_logs (user_id, created_at desc);

-- feedback
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  usage_id bigint not null references public.usage_logs (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);

-- Row Level Security --------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.usage_logs enable row level security;
alter table public.feedback enable row level security;

-- profiles: users read and update only their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- usage_logs and feedback: no policies, so only the service role (used by the
-- API routes) can read or write them.
