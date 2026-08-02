-- VocabLab: registro seguro de dispositivos pareados.
-- Execute depois de 202607290003_sync_identity_claims.sql.
-- O campo guarda somente metadados e hashes; nunca guarda a chave do navegador.

alter table if exists public.vocablab_sync_claims
  add column if not exists devices jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vocablab_sync_claims_devices_array'
      and conrelid = 'public.vocablab_sync_claims'::regclass
  ) then
    alter table public.vocablab_sync_claims
      add constraint vocablab_sync_claims_devices_array
      check (jsonb_typeof(devices) = 'array');
  end if;
end $$;

-- Preserve pre-existing authorizations as revocable placeholders. The next
-- sync from a browser replaces its own placeholder with real metadata.
update public.vocablab_sync_claims as claims
set devices = coalesce((
  select jsonb_agg(jsonb_build_object(
    'id', 'legacy-' || left(token.token_hash, 24),
    'tokenHash', token.token_hash,
    'label', 'Dispositivo anterior',
    'kind', 'unknown',
    'role', 'study',
    'createdAt', claims.created_at,
    'lastSeenAt', claims.updated_at
  ))
  from jsonb_array_elements_text(claims.device_token_hashes) as token(token_hash)
  where token.token_hash ~ '^[a-f0-9]{64}$'
), '[]'::jsonb)
where claims.devices = '[]'::jsonb
  and jsonb_typeof(claims.device_token_hashes) = 'array';

alter table if exists public.vocablab_sync_claims enable row level security;
revoke all on table public.vocablab_sync_claims from anon, authenticated;
grant all on table public.vocablab_sync_claims to service_role;
