-- VocabLab Revolution: automatic, per-Lab synchronization.
-- Run this file once in Supabase SQL Editor.

create table if not exists public.vocablab_sync_general (
  sync_code text primary key,
  payload jsonb not null,
  schema_version integer not null default 1,
  revision bigint not null default 1 check (revision >= 1),
  last_writer text,
  updated_at timestamptz not null default now()
);

create table if not exists public.vocablab_sync_vocab
  (like public.vocablab_sync_general including all);
create table if not exists public.vocablab_sync_regency
  (like public.vocablab_sync_general including all);
create table if not exists public.vocablab_sync_rule
  (like public.vocablab_sync_general including all);
create table if not exists public.vocablab_sync_read
  (like public.vocablab_sync_general including all);
create table if not exists public.vocablab_sync_question
  (like public.vocablab_sync_general including all);

create index if not exists vocablab_sync_general_updated_idx
  on public.vocablab_sync_general (updated_at);
create index if not exists vocablab_sync_vocab_updated_idx
  on public.vocablab_sync_vocab (updated_at);
create index if not exists vocablab_sync_regency_updated_idx
  on public.vocablab_sync_regency (updated_at);
create index if not exists vocablab_sync_rule_updated_idx
  on public.vocablab_sync_rule (updated_at);
create index if not exists vocablab_sync_read_updated_idx
  on public.vocablab_sync_read (updated_at);
create index if not exists vocablab_sync_question_updated_idx
  on public.vocablab_sync_question (updated_at);

alter table public.vocablab_sync_general enable row level security;
alter table public.vocablab_sync_vocab enable row level security;
alter table public.vocablab_sync_regency enable row level security;
alter table public.vocablab_sync_rule enable row level security;
alter table public.vocablab_sync_read enable row level security;
alter table public.vocablab_sync_question enable row level security;

-- The browser never talks to these tables directly. Only the Next.js server,
-- authenticated with SUPABASE_SERVICE_ROLE_KEY, can read or write them.
revoke all on table public.vocablab_sync_general from anon, authenticated;
revoke all on table public.vocablab_sync_vocab from anon, authenticated;
revoke all on table public.vocablab_sync_regency from anon, authenticated;
revoke all on table public.vocablab_sync_rule from anon, authenticated;
revoke all on table public.vocablab_sync_read from anon, authenticated;
revoke all on table public.vocablab_sync_question from anon, authenticated;

grant all on table public.vocablab_sync_general to service_role;
grant all on table public.vocablab_sync_vocab to service_role;
grant all on table public.vocablab_sync_regency to service_role;
grant all on table public.vocablab_sync_rule to service_role;
grant all on table public.vocablab_sync_read to service_role;
grant all on table public.vocablab_sync_question to service_role;
