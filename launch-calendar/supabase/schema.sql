-- Launch Calendar schema (PRD §3)
-- Apply with: Supabase dashboard → SQL Editor → paste and run.
-- Safe to re-run: every statement is guarded.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type event_type as enum (
      'product_launch',
      'promo',
      'restock',
      'content_moment',
      'evergreen_push',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type event_status as enum (
      'confirmed',
      'tentative',
      'at_risk',
      'completed',
      'cancelled'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          event_type not null,
  status        event_status not null default 'tentative',
  brief         text not null default '',
  launch_date   date not null,
  promo_end_date date,
  inventory_date date,
  asset_deadline date,
  teaser_start  date,
  channels      jsonb not null default '{
    "paid":    {"involved": false, "priority": null},
    "email":   {"involved": false, "priority": null},
    "organic": {"involved": false, "priority": null},
    "sms":     {"involved": false, "priority": null}
  }'::jsonb,
  owner         text not null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text not null
);

create index if not exists events_launch_date_idx on events (launch_date);
create index if not exists events_status_idx on events (status);

-- At least one channel must be involved (PRD §7 required fields).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_channel_involvement_check'
  ) then
    alter table events add constraint events_channel_involvement_check check (
      coalesce((channels -> 'paid'    ->> 'involved')::boolean, false)
      or coalesce((channels -> 'email'   ->> 'involved')::boolean, false)
      or coalesce((channels -> 'organic' ->> 'involved')::boolean, false)
      or coalesce((channels -> 'sms'     ->> 'involved')::boolean, false)
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- changelog
--
-- event_id is nullable with ON DELETE SET NULL, and event_name is denormalised,
-- so that hard-deleting an event leaves its history readable (PRD §3).
-- ---------------------------------------------------------------------------

create table if not exists changelog (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid references events (id) on delete set null,
  event_name     text not null,
  change_summary text not null,
  changed_by     text not null,
  created_at     timestamptz not null default now()
);

create index if not exists changelog_created_at_idx on changelog (created_at desc);
create index if not exists changelog_event_id_idx on changelog (event_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
--
-- The application always sets updated_at/updated_by explicitly so that an edit
-- is stamped with the editor's display name. This trigger is a backstop for
-- rows touched directly in the SQL editor.
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
  before update on events
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Access control for this app is the shared password gate in front of the whole
-- site (PRD §6), not Postgres roles: anyone past the gate may edit anything,
-- and the trust mechanism is visibility (every card shows who last touched it).
-- RLS is therefore enabled with deliberately permissive policies rather than
-- left off, so that the posture is explicit rather than accidental.
--
-- Do not "tighten" these without also introducing real per-user auth; doing so
-- would break every read and write in the app.
-- ---------------------------------------------------------------------------

alter table events enable row level security;
alter table changelog enable row level security;

drop policy if exists events_anon_all on events;
create policy events_anon_all on events
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists changelog_anon_all on changelog;
create policy changelog_anon_all on changelog
  for all to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'changelog'
  ) then
    alter publication supabase_realtime add table changelog;
  end if;
end
$$;
