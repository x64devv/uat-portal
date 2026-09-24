-- Vantage UAT portal — schema. Safe to run again.
--
-- ⚠⚠ RLS is ON with NO policies on every table. Only the secret key (server side) reads or writes
-- anything. A publishable key does not fail against these tables — it returns zero rows, which on
-- screen looks exactly like "nobody has tested anything". lib/config.ts refuses that key by shape.

create extension if not exists pgcrypto;

-- ── Testers ───────────────────────────────────────────────────────────────────────────────────
-- One row per person. The email is the sign-in; the row is the gate, checked on every request, so
-- deactivating somebody locks them out on their next click.
create table if not exists uat_testers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text not null,
  is_admin    boolean not null default false,
  active      boolean not null default true,
  added_by    text,
  created_at  timestamptz not null default now()
);
create unique index if not exists uat_testers_email_uq on uat_testers (lower(email));

-- ── Steps ─────────────────────────────────────────────────────────────────────────────────────
-- Loaded from script/steps.json by supabase/seed.sql. `fields` is the list of figures a step asks
-- for: [{ "key": "gross", "label": "Gross" }, …].
create table if not exists uat_steps (
  id           text primary key,
  seq          int  not null,
  area         text not null,
  title        text not null,
  instructions text not null,
  expect       text not null,
  closes       text,
  expect_fail  text,
  fields       jsonb not null default '[]'::jsonb,
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- ── Results ───────────────────────────────────────────────────────────────────────────────────
-- ⚠ Append-only. A tester who re-runs a step adds a row; their latest row is their answer, and the
-- earlier ones stay as history. Nothing in the portal updates or deletes a result.
--
-- ⚠⚠ There is no row for "not attempted". A step nobody has touched has NO results at all, and the
-- run board lists those first — an untouched step and a passing step must never look the same.
-- `not_run` is different: a tester looked at the step and says they did not run it (and why).
do $$ begin
  create type uat_outcome as enum ('pass', 'fail', 'blocked', 'not_run');
exception when duplicate_object then null; end $$;

create table if not exists uat_results (
  id          uuid primary key default gen_random_uuid(),
  step_id     text not null references uat_steps(id),
  tester_id   uuid not null references uat_testers(id),
  outcome     uat_outcome not null,
  figures     jsonb not null default '{}'::jsonb,
  notes       text,
  issue_ref   text,
  recorded_at timestamptz not null default now()
);
create index if not exists uat_results_step_idx   on uat_results (step_id, recorded_at desc);
create index if not exists uat_results_tester_idx on uat_results (tester_id, recorded_at desc);

-- ── Screenshots ───────────────────────────────────────────────────────────────────────────────
create table if not exists uat_attachments (
  id           uuid primary key default gen_random_uuid(),
  result_id    uuid not null references uat_results(id),
  path         text not null,
  filename     text not null,
  content_type text,
  bytes        bigint,
  created_at   timestamptz not null default now()
);
create index if not exists uat_attachments_result_idx on uat_attachments (result_id);

alter table uat_testers     enable row level security;
alter table uat_steps       enable row level security;
alter table uat_results     enable row level security;
alter table uat_attachments enable row level security;

-- ── Storage bucket for screenshots (private) ──────────────────────────────────────────────────
-- Only on Supabase, where the storage schema exists. Files are served through short-lived signed
-- URLs made on the server; the bucket is never public.
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('uat-evidence', 'uat-evidence', false, 10485760,
            array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
