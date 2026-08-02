"use client"

import {
  getOrCreateSyncDeviceId,
  getSyncDeviceKind,
  getSyncDeviceLabel,
  setSyncDeviceRole,
  type SyncDeviceRole,
  type SyncDeviceKind,
} from "./sync-device"

export const SYNC_OWNER_TOKENS_KEY = "vocablab_sync_owner_tokens"

function readOwnerTokens() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_OWNER_TOKENS_KEY) ?? "{}")
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, string>
      : {}
  } catch {
    return {}
  }
}

function writeOwnerTokens(tokens: Record<string, string>) {
  localStorage.setItem(SYNC_OWNER_TOKENS_KEY, JSON.stringify(tokens))
}

function generateOwnerToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
}

export function getSyncOwnerToken(syncCode: string) {
  const token = readOwnerTokens()[syncCode]
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : ""
}

export function getOrCreateSyncOwnerToken(syncCode: string) {
  const existing = getSyncOwnerToken(syncCode)
  if (existing) return existing
  const token = generateOwnerToken()
  const tokens = readOwnerTokens()
  tokens[syncCode] = token
  writeOwnerTokens(tokens)
  return token
}

async function responseJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<{
    error?: string
    code?: string
    pairingCode?: string
    expiresAt?: string
    devices?: SyncDevice[]
    count?: number
  }>
}

export type SyncDevice = {
  id: string
  label: string
  kind: SyncDeviceKind
  createdAt: string
  lastSeenAt: string
  role: SyncDeviceRole
}

export async function claimSyncIdentity(syncCode: string) {
  const ownerToken = getOrCreateSyncOwnerToken(syncCode)
  const response = await fetch("/api/sync/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      syncCode,
      ownerToken,
      deviceId: getOrCreateSyncDeviceId(),
      deviceLabel: getSyncDeviceLabel(),
      deviceKind: getSyncDeviceKind(),
    }),
  })
  const json = await responseJson(response)
  if (response.ok) {
    setSyncDeviceRole("primary")
    return { ok: true as const }
  }
  return {
    ok: false as const,
    taken: response.status === 409 && json.code === "SYNC_IDENTITY_TAKEN",
    error: json.error || "Não foi possível confirmar esta identificação.",
  }
}

export async function startSyncPairing(syncCode: string) {
  const ownerToken = getSyncOwnerToken(syncCode)
  if (!ownerToken) throw new Error("Este navegador não possui a chave proprietária.")
  const response = await fetch("/api/sync/pair/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncCode, ownerToken }),
  })
  const json = await responseJson(response)
  if (!response.ok || !json.pairingCode || !json.expiresAt) {
    throw new Error(json.error || "Não foi possível iniciar o pareamento.")
  }
  return { pairingCode: json.pairingCode, expiresAt: json.expiresAt }
}

export async function listSyncDevices(syncCode: string) {
  const ownerToken = getSyncOwnerToken(syncCode)
  if (!ownerToken) throw new Error("Este navegador nÃ£o possui a chave proprietÃ¡ria.")
  const response = await fetch("/api/sync/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list", syncCode, ownerToken }),
  })
  const json = await responseJson(response)
  if (!response.ok) {
    const error = new Error(json.error || "NÃ£o foi possÃ­vel carregar os dispositivos.") as Error & { code?: string }
    error.code = json.code
    throw error
  }
  return { devices: json.devices ?? [], count: json.count ?? 0 }
}

export async function revokeSyncDevice(syncCode: string, deviceId: string) {
  const ownerToken = getSyncOwnerToken(syncCode)
  if (!ownerToken) throw new Error("Este navegador nÃ£o possui a chave proprietÃ¡ria.")
  const response = await fetch("/api/sync/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "revoke", syncCode, ownerToken, deviceId }),
  })
  const json = await responseJson(response)
  if (!response.ok) throw new Error(json.error || "NÃ£o foi possÃ­vel desconectar o dispositivo.")
}

export async function setSyncDeviceRoleRemote(syncCode: string, deviceId: string, role: SyncDeviceRole) {
  const ownerToken = getSyncOwnerToken(syncCode)
  if (!ownerToken) throw new Error("Este navegador não possui a chave proprietária.")
  const response = await fetch("/api/sync/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "set-role",
      syncCode,
      ownerToken,
      actorDeviceId: getOrCreateSyncDeviceId(),
      deviceId,
      role,
    }),
  })
  const json = await responseJson(response)
  if (!response.ok) throw new Error(json.error || "Não foi possível alterar o tipo de conexão.")
  if (deviceId === getOrCreateSyncDeviceId()) setSyncDeviceRole(role)
}

export async function completeSyncPairing(syncCode: string, pairingCode: string) {
  const ownerToken = getOrCreateSyncOwnerToken(syncCode)
  const response = await fetch("/api/sync/pair/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      syncCode,
      pairingCode,
      ownerToken,
      deviceId: getOrCreateSyncDeviceId(),
      deviceLabel: getSyncDeviceLabel(),
      deviceKind: getSyncDeviceKind(),
    }),
  })
  const json = await responseJson(response)
  if (!response.ok) throw new Error(json.error || "Não foi possível concluir o pareamento.")
}
