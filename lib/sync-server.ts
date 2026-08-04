import "server-only"

import { createHmac } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { SyncLabId } from "@/lib/sync-schema"

const DEFAULT_SYNC_TABLE = "vocablab_sync_state"
const DEFAULT_SYNC_CLAIMS_TABLE = "vocablab_sync_claims"
const DEFAULT_SYNC_OPERATIONS_TABLE = "vocablab_sync_operations"
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

export function getSyncOperationsTable() {
  const table = process.env.SUPABASE_SYNC_OPERATIONS_TABLE?.trim() || DEFAULT_SYNC_OPERATIONS_TABLE
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(table)) {
    throw new Error("SUPABASE_SYNC_OPERATIONS_TABLE is invalid.")
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

export type SyncDeviceKind = "mobile" | "tablet" | "desktop" | "unknown"
export type SyncDeviceRole = "primary" | "study"

export type SyncDeviceRecord = {
  id: string
  tokenHash: string
  label: string
  kind: SyncDeviceKind
  role: SyncDeviceRole
  createdAt: string
  lastSeenAt: string
}

export function normalizeSyncDeviceId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value)
    ? value
    : ""
}

export function normalizeSyncDeviceLabel(value: unknown) {
  if (typeof value !== "string") return "Dispositivo"
  const label = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80)
  return label || "Dispositivo"
}

export function normalizeSyncDeviceKind(value: unknown): SyncDeviceKind {
  return value === "mobile" || value === "tablet" || value === "desktop" || value === "unknown"
    ? value
    : "unknown"
}

export function normalizeSyncDeviceRole(value: unknown): SyncDeviceRole {
  return value === "study" ? "study" : "primary"
}

export function isMissingSyncDevicesColumn(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown } | null
  const code = String(candidate?.code ?? "")
  const message = String(candidate?.message ?? error ?? "").toLowerCase()
  return code === "42703" || code === "PGRST204" || (message.includes("devices") && (message.includes("column") || message.includes("schema cache")))
}

function validStoredDevices(value: unknown) {
  if (!Array.isArray(value)) return [] as SyncDeviceRecord[]
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const id = normalizeSyncDeviceId(record.id)
    const tokenHash = typeof record.tokenHash === "string" ? record.tokenHash : ""
    if (!id || !/^[a-f0-9]{64}$/.test(tokenHash)) return []
    return [{
      id,
      tokenHash,
      label: normalizeSyncDeviceLabel(record.label),
      kind: normalizeSyncDeviceKind(record.kind),
      role: normalizeSyncDeviceRole(record.role),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      lastSeenAt: typeof record.lastSeenAt === "string" ? record.lastSeenAt : new Date().toISOString(),
    }]
  })
}

export async function touchSyncDevice(
  supabase: SupabaseClient,
  syncHash: string,
  ownerToken: string,
  pepper: string,
  metadata: { id: unknown; label?: unknown; kind?: unknown; role?: unknown },
) {
  const id = normalizeSyncDeviceId(metadata.id)
  if (!id) return false
  const table = getSyncClaimsTable()
  const { data, error } = await supabase
    .from(table)
    .select("devices, device_token_hashes")
    .eq("sync_code", syncHash)
    .maybeSingle()
  if (error) {
    if (isMissingSyncDevicesColumn(error)) return false
    throw error
  }
  if (!data) return false

  const now = new Date().toISOString()
  const tokenHash = hashOwnerToken(ownerToken, pepper)
  const devices = validStoredDevices(data.devices)
  const existing = devices.find((device) => device.id === id)
  const nextDevice: SyncDeviceRecord = {
    id,
    tokenHash,
    label: normalizeSyncDeviceLabel(metadata.label),
    kind: normalizeSyncDeviceKind(metadata.kind),
    role: existing?.role ?? normalizeSyncDeviceRole(metadata.role),
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
  }
  // Older claims can be backfilled with a legacy placeholder derived from the
  // token hash. Replace that placeholder as soon as the real browser checks in.
  const withoutLegacyAlias = devices.filter((device) => (
    !(device.id.startsWith("legacy-") && device.tokenHash === tokenHash && device.id !== id)
  ))
  const nextDevices = existing
    ? withoutLegacyAlias.map((device) => device.id === id ? nextDevice : device)
    : [...withoutLegacyAlias, nextDevice]
  const tokenHashes = Array.isArray(data.device_token_hashes)
    ? data.device_token_hashes.filter((value): value is string => typeof value === "string")
    : []
  const nextHashes = [...new Set([...tokenHashes, tokenHash])].slice(-20)
  const { error: updateError } = await supabase
    .from(table)
    .update({ devices: nextDevices, device_token_hashes: nextHashes, updated_at: now })
    .eq("sync_code", syncHash)
  if (updateError) {
    if (isMissingSyncDevicesColumn(updateError)) return false
    throw updateError
  }
  return true
}

export async function listStoredSyncDevices(
  supabase: SupabaseClient,
  syncHash: string,
) {
  const { data, error } = await supabase
    .from(getSyncClaimsTable())
    .select("devices")
    .eq("sync_code", syncHash)
    .maybeSingle()
  if (error) {
    if (isMissingSyncDevicesColumn(error)) return null
    throw error
  }
  if (!data) return []
  return validStoredDevices(data.devices)
    .map(({ tokenHash: _tokenHash, ...device }) => device)
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
}

export async function getStoredSyncDeviceRole(
  supabase: SupabaseClient,
  syncHash: string,
  ownerToken: string,
  pepper: string,
  deviceId: string,
) {
  const { data, error } = await supabase
    .from(getSyncClaimsTable())
    .select("devices")
    .eq("sync_code", syncHash)
    .maybeSingle()
  if (error) {
    if (isMissingSyncDevicesColumn(error)) return null
    throw error
  }
  const tokenHash = hashOwnerToken(ownerToken, pepper)
  const device = validStoredDevices(data?.devices).find((item) => item.id === deviceId && item.tokenHash === tokenHash)
  return device?.role ?? "unknown"
}

export async function setStoredSyncDeviceRole(
  supabase: SupabaseClient,
  syncHash: string,
  ownerToken: string,
  pepper: string,
  actorDeviceId: string,
  targetDeviceId: string,
  role: SyncDeviceRole,
) {
  const table = getSyncClaimsTable()
  const { data, error } = await supabase
    .from(table)
    .select("devices")
    .eq("sync_code", syncHash)
    .maybeSingle()
  if (error) {
    if (isMissingSyncDevicesColumn(error)) return null
    throw error
  }
  if (!data) return false
  const devices = validStoredDevices(data.devices)
  const tokenHash = hashOwnerToken(ownerToken, pepper)
  const actor = devices.find((item) => item.id === actorDeviceId && item.tokenHash === tokenHash)
  const target = devices.find((item) => item.id === targetDeviceId)
  if (!actor || !target) return false
  if (actor.id !== target.id && actor.role !== "primary") return "forbidden" as const
  const nextDevices = devices.map((item) => ({
    ...item,
    role: item.id === targetDeviceId ? role : role === "primary" ? "study" : item.role,
  }))
  const { error: updateError } = await supabase
    .from(table)
    .update({ devices: nextDevices, updated_at: new Date().toISOString() })
    .eq("sync_code", syncHash)
  if (updateError) {
    if (isMissingSyncDevicesColumn(updateError)) return null
    throw updateError
  }
  return true
}

export async function revokeStoredSyncDevice(
  supabase: SupabaseClient,
  syncHash: string,
  deviceId: string,
) {
  const table = getSyncClaimsTable()
  const { data, error } = await supabase
    .from(table)
    .select("devices, device_token_hashes")
    .eq("sync_code", syncHash)
    .maybeSingle()
  if (error) {
    if (isMissingSyncDevicesColumn(error)) return null
    throw error
  }
  if (!data) return false
  const devices = validStoredDevices(data.devices)
  const target = devices.find((device) => device.id === deviceId)
  if (!target) return false
  const nextDevices = devices.filter((device) => device.id !== deviceId)
  const stillUsed = new Set(nextDevices.map((device) => device.tokenHash))
  const hashes = Array.isArray(data.device_token_hashes)
    ? data.device_token_hashes.filter((value): value is string => typeof value === "string")
    : []
  const nextHashes = hashes.filter((hash) => hash !== target.tokenHash || stillUsed.has(hash))
  const { error: updateError } = await supabase
    .from(table)
    .update({ devices: nextDevices, device_token_hashes: nextHashes, updated_at: new Date().toISOString() })
    .eq("sync_code", syncHash)
  if (updateError) {
    if (isMissingSyncDevicesColumn(updateError)) return null
    throw updateError
  }
  return true
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
