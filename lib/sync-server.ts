import "server-only"

import { createHmac } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { SyncLabId } from "@/lib/sync-schema"

const DEFAULT_SYNC_TABLE = "vocablab_sync_state"
const DEFAULT_SYNC_CLAIMS_TABLE = "vocablab_sync_claims"
const SUPABASE_TIMEOUT_MS = 15_000
const DEFAULT_LAB_TABLES: Record<SyncLabId, string> = {
  general: "vocablab_sync_general",
  vocab: "vocablab_sync_vocab",
  regency: "vocablab_sync_regency",
  rule: "vocablab_sync_rule",
  read: "vocablab_sync_read",
  question: "vocablab_sync_question",
}

const LAB_TABLE_ENV: Record<SyncLabId, string> = {
  general: "SUPABASE_SYNC_GENERAL_TABLE",
  vocab: "SUPABASE_SYNC_VOCAB_TABLE",
  regency: "SUPABASE_SYNC_REGENCY_TABLE",
  rule: "SUPABASE_SYNC_RULE_TABLE",
  read: "SUPABASE_SYNC_READ_TABLE",
  question: "SUPABASE_SYNC_QUESTION_TABLE",
}

export function getSyncServerConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const table = process.env.SUPABASE_SYNC_TABLE?.trim() || DEFAULT_SYNC_TABLE
  const configuredPepper = process.env.SYNC_CODE_PEPPER?.trim()

  if (!url || !serviceKey) throw new Error("Supabase sync is not configured.")
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(table)) {
    throw new Error("SUPABASE_SYNC_TABLE is invalid.")
  }
  if (process.env.NODE_ENV === "production" && (!configuredPepper || configuredPepper.length < 32)) {
    throw new Error("SYNC_CODE_PEPPER must contain at least 32 characters in production.")
  }

  return {
    url,
    serviceKey,
    table,
    // Development remains usable before a pepper is configured. Production
    // refuses the fallback so service-key rotation cannot invalidate backups.
    pepper: configuredPepper || serviceKey,
  }
}

export function getSyncLabTable(lab: SyncLabId) {
  const configured = process.env[LAB_TABLE_ENV[lab]]?.trim()
  const table = configured || DEFAULT_LAB_TABLES[lab]
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(table)) {
    throw new Error(`${LAB_TABLE_ENV[lab]} is invalid.`)
  }
  return table
}

export function getSyncClaimsTable() {
  const table = process.env.SUPABASE_SYNC_CLAIMS_TABLE?.trim() || DEFAULT_SYNC_CLAIMS_TABLE
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(table)) {
    throw new Error("SUPABASE_SYNC_CLAIMS_TABLE is invalid.")
  }
  return table
}

export function hashSyncCode(syncCode: string, pepper: string) {
  return createHmac("sha256", pepper)
    .update(syncCode)
    .digest("hex")
}

export function normalizeOwnerToken(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
    ? value.toLowerCase()
    : ""
}

export function hashOwnerToken(ownerToken: string, pepper: string) {
  return createHmac("sha256", pepper)
    .update(`owner:${ownerToken}`)
    .digest("hex")
}

export function hashPairingCode(
  syncHash: string,
  pairingCode: string,
  pepper: string,
) {
  return createHmac("sha256", pepper)
    .update(`pair:${syncHash}:${pairingCode}`)
    .digest("hex")
}

export async function verifySyncOwner(
  supabase: SupabaseClient,
  syncHash: string,
  ownerToken: string,
  pepper: string,
) {
  const token = normalizeOwnerToken(ownerToken)
  if (!token) return false
  const { data, error } = await supabase
    .from(getSyncClaimsTable())
    .select("device_token_hashes")
    .eq("sync_code", syncHash)
    .maybeSingle()
  if (error) throw error
  const hashes = Array.isArray(data?.device_token_hashes)
    ? data.device_token_hashes.filter((value): value is string => typeof value === "string")
    : []
  return hashes.includes(hashOwnerToken(token, pepper))
}

export function createSyncServerClient(config: ReturnType<typeof getSyncServerConfig>) {
  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(SUPABASE_TIMEOUT_MS)])
          : AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
      }),
    },
  })
}
