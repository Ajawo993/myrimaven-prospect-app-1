-- Myrimaven Prospect Desk: database tables
-- Paste this whole file into Supabase → SQL Editor → New query, and click Run.
-- It's safe to run more than once.
--
-- Tables
--   organizations  the sample organizations shown on Discover (shared, read-only for users)
--   prospects      organizations a user has saved, with fit answers, status and next step
--   contacts       people at a prospect, with purchasing authority and connection
--   outreach       each contact attempt: date, channel, response, reason, what was learned
--   evidence       supporting evidence for "Why is this a prospect?", ticked when checked
--   unknowns       open questions to validate, ticked when answered
--
-- Every row a user creates carries their user_id, and row-level security makes sure
-- each signed-in person can only see and change their own rows.

-- ───────────────────────── organizations ─────────────────────────
create table if not exists public.organizations (
  key          text primary key,
  name         text not null,
  sector       text not null default '',
  size         text not null default '',
  region       text not null default '',
  summary      text not null default '',
  hiring       text not null default '',
  signals      text[] not null default '{}',
  fit_code     text not null default '',          -- 8 characters: y / n / ? for each fit criterion
  outside_focus boolean not null default false,   -- e.g. K-12 and career coaches
  assessment   jsonb not null default '{}'::jsonb, -- problems, evidence, unknowns, roles, fitConcerns
  created_at   timestamptz not null default now()
);

-- ───────────────────────── prospects ─────────────────────────
create table if not exists public.prospects (
  id               text primary key default gen_random_uuid()::text,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  organization_key text references public.organizations (key) on delete set null,
  name             text not null,
  sector           text not null default '',
  size             text not null default '',
  region           text not null default '',
  website          text not null default '',
  summary          text not null default '',
  signals          text[] not null default '{}',
  is_example       boolean not null default false,
  status           text not null default 'Needs Validation'
                   check (status in ('Needs Validation', 'Potential Fit', 'Contacted', 'Follow-Up', 'Not a Fit')),
  fit              jsonb not null default '{}'::jsonb,  -- {"adults":"yes","size":"unknown",...}
  fit_why          jsonb not null default '{}'::jsonb,  -- reasons behind fit answers
  fit_note         text not null default '',
  next_action      text not null default '',
  follow_up_date   date,
  notes            text not null default '',
  jobs             jsonb,                               -- latest job-posting check, if any
  assessment       jsonb not null default '{}'::jsonb,  -- problems, roles, fitConcerns, generatedBy, generatedAt
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists prospects_user_id_idx on public.prospects (user_id);
create index if not exists prospects_follow_up_idx on public.prospects (user_id, follow_up_date);

-- ───────────────────────── contacts ─────────────────────────
create table if not exists public.contacts (
  id          text primary key default gen_random_uuid()::text,
  prospect_id text not null references public.prospects (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  role        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  authority   text not null default 'Unknown'
              check (authority in ('Decision-maker', 'Influencer', 'No purchasing authority', 'Unknown')),
  connection  text not null default 'Unknown'
              check (connection in ('Warm', 'Referral', 'Cold', 'Unknown')),
  notes       text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists contacts_prospect_idx on public.contacts (prospect_id);
create index if not exists contacts_user_idx on public.contacts (user_id);

-- ───────────────────────── outreach ─────────────────────────
create table if not exists public.outreach (
  id          text primary key default gen_random_uuid()::text,
  prospect_id text not null references public.prospects (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id  text references public.contacts (id) on delete set null,
  date        date not null default current_date,
  connection  text not null default 'Unknown'
              check (connection in ('Warm', 'Referral', 'Cold', 'Unknown')),
  channel     text not null default '',
  outcome     text not null
              check (outcome in ('No response', 'Interested', 'Meeting booked', 'Referred elsewhere', 'Not interested')),
  reason      text not null default '',   -- why it wasn't a fit, if it wasn't
  learned     text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists outreach_prospect_idx on public.outreach (prospect_id);
create index if not exists outreach_user_idx on public.outreach (user_id);
create index if not exists outreach_contact_idx on public.outreach (contact_id);

-- ───────────────────────── evidence ─────────────────────────
create table if not exists public.evidence (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   text not null references public.prospects (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text          text not null,
  source        text not null default '',
  checked       boolean not null default false,
  added_by_user boolean not null default false,
  position      integer not null default 0
);
create index if not exists evidence_prospect_idx on public.evidence (prospect_id);
create index if not exists evidence_user_idx on public.evidence (user_id);

-- ───────────────────────── unknowns ─────────────────────────
create table if not exists public.unknowns (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   text not null references public.prospects (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text          text not null,
  answered      boolean not null default false,
  added_by_user boolean not null default false,
  position      integer not null default 0
);
create index if not exists unknowns_prospect_idx on public.unknowns (prospect_id);
create index if not exists unknowns_user_idx on public.unknowns (user_id);

-- ───────────────────────── keep updated_at current ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prospects_set_updated_at on public.prospects;
create trigger prospects_set_updated_at before update on public.prospects
  for each row execute function public.set_updated_at();

-- ───────────────────────── row-level security ─────────────────────────
alter table public.organizations enable row level security;
alter table public.prospects     enable row level security;
alter table public.contacts      enable row level security;
alter table public.outreach      enable row level security;
alter table public.evidence      enable row level security;
alter table public.unknowns      enable row level security;

drop policy if exists "Signed-in users can read organizations" on public.organizations;
create policy "Signed-in users can read organizations" on public.organizations
  for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['prospects', 'contacts', 'outreach', 'evidence', 'unknowns'] loop
    execute format('drop policy if exists "Users manage their own rows" on public.%I', t);
    execute format(
      'create policy "Users manage their own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- Child rows must belong to a prospect the same user owns
create or replace function public.owns_prospect(pid text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.prospects p where p.id = pid and p.user_id = (select auth.uid()));
$$;

do $$
declare t text;
begin
  foreach t in array array['contacts', 'outreach', 'evidence', 'unknowns'] loop
    execute format('drop policy if exists "Rows attach to own prospects" on public.%I', t);
    execute format(
      'create policy "Rows attach to own prospects" on public.%I as restrictive for all to authenticated
         using (public.owns_prospect(prospect_id)) with check (public.owns_prospect(prospect_id))', t);
  end loop;
end;
$$;

grant select on public.organizations to authenticated;
grant select, insert, update, delete on public.prospects, public.contacts, public.outreach, public.evidence, public.unknowns to authenticated;

-- ───────────────────────── save a whole prospect in one step ─────────────────────────
-- The app sends one prospect (with its contacts, outreach, evidence and unknowns) as JSON.
-- save_prospect saves it all in a single transaction as the signed-in user.
-- _save_prospect_as does the work; called by a user, row-level security still applies,
-- so nobody can save into someone else's account. The starter-workspace copy uses it too.
create or replace function public._save_prospect_as(uid uuid, p jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  pid text := p ->> 'id';
begin
  if uid is null then
    raise exception 'Sign in to save prospects' using errcode = '42501';
  end if;
  if pid is null or pid = '' then
    raise exception 'Prospect id is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.prospects where id = pid and user_id <> uid) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  insert into public.prospects as t (
    id, user_id, organization_key, name, sector, size, region, website, summary, signals, is_example,
    status, fit, fit_why, fit_note, next_action, follow_up_date, notes, jobs, assessment, created_at
  ) values (
    pid, uid,
    (select o.key from public.organizations o where o.key = nullif(p ->> 'catalogKey', '')),
    coalesce(nullif(p ->> 'name', ''), 'Untitled organization'),
    coalesce(p ->> 'sector', ''), coalesce(p ->> 'size', ''), coalesce(p ->> 'region', ''),
    coalesce(p ->> 'website', ''), coalesce(p ->> 'summary', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'signals', '[]'::jsonb))), '{}'),
    coalesce((p ->> 'example')::boolean, false),
    coalesce(nullif(p ->> 'status', ''), 'Needs Validation'),
    coalesce(p -> 'fit', '{}'::jsonb), coalesce(p -> 'fitWhy', '{}'::jsonb),
    coalesce(p ->> 'fitNote', ''), coalesce(p ->> 'nextAction', ''),
    nullif(p ->> 'followUpDate', '')::date,
    coalesce(p ->> 'notes', ''),
    case when jsonb_typeof(p -> 'jobs') = 'object' then p -> 'jobs' end,
    coalesce(p -> 'analysis', '{}'::jsonb) - 'evidence' - 'unknowns',
    coalesce(to_timestamp((p ->> 'createdAt')::double precision / 1000), now())
  )
  on conflict (id) do update set
    organization_key = excluded.organization_key, name = excluded.name, sector = excluded.sector,
    size = excluded.size, region = excluded.region, website = excluded.website, summary = excluded.summary,
    signals = excluded.signals, is_example = excluded.is_example, status = excluded.status,
    fit = excluded.fit, fit_why = excluded.fit_why, fit_note = excluded.fit_note,
    next_action = excluded.next_action, follow_up_date = excluded.follow_up_date, notes = excluded.notes,
    jobs = excluded.jobs, assessment = excluded.assessment
  where t.user_id = uid;

  delete from public.outreach where prospect_id = pid;
  delete from public.evidence where prospect_id = pid;
  delete from public.unknowns where prospect_id = pid;
  delete from public.contacts where prospect_id = pid;

  insert into public.contacts (id, prospect_id, user_id, name, role, email, phone, authority, connection, notes, position)
  select coalesce(nullif(c.id, ''), gen_random_uuid()::text), pid, uid,
         coalesce(nullif(c.name, ''), 'Unknown'), coalesce(c.role, ''), coalesce(c.email, ''), coalesce(c.phone, ''),
         coalesce(nullif(c.authority, ''), 'Unknown'), coalesce(nullif(c.connection, ''), 'Unknown'),
         coalesce(c.notes, ''), (ord - 1)::int
  from rows from (
         jsonb_to_recordset(coalesce(p -> 'contacts', '[]'::jsonb))
           as (id text, name text, role text, email text, phone text, authority text, connection text, notes text)
       ) with ordinality as c(id, name, role, email, phone, authority, connection, notes, ord);

  insert into public.outreach (id, prospect_id, user_id, contact_id, date, connection, channel, outcome, reason, learned)
  select coalesce(nullif(o.id, ''), gen_random_uuid()::text), pid, uid,
         (select c.id from public.contacts c where c.id = nullif(o."contactId", '') and c.prospect_id = pid),
         coalesce(nullif(o.date, '')::date, current_date),
         coalesce(nullif(o.connection, ''), 'Unknown'), coalesce(o.channel, ''),
         coalesce(nullif(o.outcome, ''), 'No response'), coalesce(o.reason, ''), coalesce(o.learned, '')
  from jsonb_to_recordset(coalesce(p -> 'outreach', '[]'::jsonb))
       as o(id text, "contactId" text, date text, connection text, channel text, outcome text, reason text, learned text);

  insert into public.evidence (prospect_id, user_id, text, source, checked, added_by_user, position)
  select pid, uid, e.v ->> 'text', coalesce(e.v ->> 'source', ''),
         coalesce((e.v ->> 'checked')::boolean, false), coalesce((e.v ->> 'mine')::boolean, false), (e.i - 1)::int
  from jsonb_array_elements(coalesce(p -> 'analysis' -> 'evidence', '[]'::jsonb)) with ordinality as e(v, i)
  where coalesce(e.v ->> 'text', '') <> '';

  insert into public.unknowns (prospect_id, user_id, text, answered, added_by_user, position)
  select pid, uid, u.v ->> 'text',
         coalesce((u.v ->> 'done')::boolean, false), coalesce((u.v ->> 'mine')::boolean, false), (u.i - 1)::int
  from jsonb_array_elements(coalesce(p -> 'analysis' -> 'unknowns', '[]'::jsonb)) with ordinality as u(v, i)
  where coalesce(u.v ->> 'text', '') <> '';
end;
$$;

create or replace function public.save_prospect(p jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public._save_prospect_as((select auth.uid()), p);
end;
$$;

revoke all on function public._save_prospect_as(uuid, jsonb) from public, anon;
grant execute on function public._save_prospect_as(uuid, jsonb) to authenticated;
revoke all on function public.save_prospect(jsonb) from public, anon;
grant execute on function public.save_prospect(jsonb) to authenticated;
