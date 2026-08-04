-- Multiwriter synchronization protocol.
-- Every device appends small, idempotent operations instead of replacing a
-- whole Lab snapshot. Existing snapshot tables remain intact as a migration
-- fallback for browsers that have not yet upgraded.

create table if not exists public.vocablab_sync_operations (
  sequence bigint generated always as identity primary key,
  sync_code text not null,
  lab text not null check (lab in ('general', 'vocab', 'regency', 'rule', 'read', 'question')),
  operation_id text not null,
  device_id text,
  kind text not null check (kind in ('upsert', 'delete', 'preference-set', 'preference-delete')),
  store_name text,
  entity_id text not null,
  value jsonb,
  occurred_at bigint not null,
  created_at timestamptz not null default now(),
  unique (sync_code, operation_id)
);

create index if not exists vocablab_sync_operations_cursor_idx
  on public.vocablab_sync_operations (sync_code, lab, sequence);

alter table public.vocablab_sync_operations enable row level security;
revoke all on table public.vocablab_sync_operations from anon, authenticated;
grant all on table public.vocablab_sync_operations to service_role;
