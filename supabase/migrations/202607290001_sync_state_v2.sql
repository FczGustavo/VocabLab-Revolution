create table if not exists public.vocablab_sync_state (
  sync_code text primary key,
  payload jsonb not null,
  schema_version integer not null default 2,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.vocablab_sync_state
  add column if not exists schema_version integer not null default 2,
  add column if not exists revision bigint not null default 1;

alter table public.vocablab_sync_state enable row level security;

revoke all on table public.vocablab_sync_state from anon, authenticated;

comment on column public.vocablab_sync_state.sync_code is
  'HMAC-SHA256 of the user word plus the generated four-digit PIN; never stores the visible code.';
