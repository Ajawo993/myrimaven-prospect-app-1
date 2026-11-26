-- Weekly discovery agent: real organizations on Discover.
-- Run once in Supabase → SQL Editor (safe to run again).

-- Where each organization on Discover came from: 'sample' (fictional, for practice) or 'agent' (real, found on the web)
alter table public.organizations add column if not exists source   text not null default 'sample';
alter table public.organizations add column if not exists website  text not null default '';
alter table public.organizations add column if not exists found_at timestamptz;
create index if not exists organizations_source_found on public.organizations (source, found_at desc);

-- One row per weekly run: what it searched, how many it added, and whether it worked.
-- Signed-in users can read it (Discover shows "last updated"); only the server (secret key) writes it.
create table if not exists public.discovery_runs (
  id           bigint generated always as identity primary key,
  ran_at       timestamptz not null default now(),
  theme        text not null default '',
  region       text not null default '',
  status       text not null check (status in ('ok', 'failed')),
  added        int not null default 0,
  skipped      int not null default 0,
  note         text,
  duration_ms  int
);

alter table public.discovery_runs enable row level security;
drop policy if exists "Signed-in users can read discovery runs" on public.discovery_runs;
create policy "Signed-in users can read discovery runs" on public.discovery_runs
  for select to authenticated using (true);
revoke all on public.discovery_runs from anon;
grant select on public.discovery_runs to authenticated;
-- organizations already has "Signed-in users can read organizations" and no write policies,
-- so only the server's agent can add to it.
