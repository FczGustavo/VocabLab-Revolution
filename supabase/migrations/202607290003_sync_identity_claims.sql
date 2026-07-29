-- VocabLab Revolution: collision-safe sync identity claims and device pairing.
-- Run this file once in Supabase SQL Editor after the per-Lab migration.

create table if not exists public.vocablab_sync_claims (
  sync_code text primary key,
  device_token_hashes jsonb not null default '[]'::jsonb,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocablab_sync_claims_tokens_array
    check (jsonb_typeof(device_token_hashes) = 'array'),
  constraint vocablab_sync_claims_pairing_consistency
    check (
      (pairing_code_hash is null and pairing_expires_at is null)
      or
      (pairing_code_hash is not null and pairing_expires_at is not null)
    )
);

create index if not exists vocablab_sync_claims_updated_idx
  on public.vocablab_sync_claims (updated_at);

alter table public.vocablab_sync_claims enable row level security;

-- Claims are accessed only through protected Next.js server routes.
revoke all on table public.vocablab_sync_claims from anon, authenticated;
grant all on table public.vocablab_sync_claims to service_role;
