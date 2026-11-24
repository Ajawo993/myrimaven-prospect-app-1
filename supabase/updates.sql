-- Daily update email + Google Calendar settings, one row per person.
-- Run once in Supabase → SQL Editor (safe to run again).
--
-- Row-level security is on with NO policies, so browsers can't read or change this table at all.
-- Only the app's server reads it, with the secret key, because it holds the Google access token.
-- The server only ever reads or writes the row of the person who's signed in (or, for the
-- daily run, sends each person's update to that same person).

create table if not exists public.user_settings (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  daily_email           boolean not null default false,
  email                 text,
  time_zone             text not null default 'America/Edmonton',
  last_digest_on        date,
  google_refresh_token  text,
  google_email          text,
  calendar_synced       jsonb not null default '{}'::jsonb,
  calendar_error        text,
  updated_at            timestamptz not null default now()
);

alter table public.user_settings enable row level security;

revoke all on public.user_settings from anon, authenticated;
