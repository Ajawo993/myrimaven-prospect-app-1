-- Prospect Desk: per-user daily limits for the AI and job-posting features.
-- Run once in the Supabase SQL Editor (safe to run again). Also included at the end of schema.sql.
--
-- Each AI or Adzuna request a person makes adds one row here. The app's server counts a
-- person's rows from the last 24 hours and refuses the request once they reach the limit
-- (see useQuota in lib/server.js). People can add their own rows and read them, but can't
-- change or delete them, so they can't reset their own count.

create table if not exists public.api_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('ai', 'jobs')),
  created_at timestamptz not null default now()
);

create index if not exists api_usage_user_kind_time on public.api_usage (user_id, kind, created_at desc);

alter table public.api_usage enable row level security;

drop policy if exists "Users read their own usage" on public.api_usage;
create policy "Users read their own usage" on public.api_usage
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users log their own usage" on public.api_usage;
create policy "Users log their own usage" on public.api_usage
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- no update or delete policy: nobody can edit or erase their usage from the app
grant select, insert on public.api_usage to authenticated;
