"use client"

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
  }>
}

export async function claimSyncIdentity(syncCode: string) {
  const ownerToken = getOrCreateSyncOwnerToken(syncCode)
  const response = await fetch("/api/sync/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncCode, ownerToken }),
  })
  const json = await responseJson(response)
  if (response.ok) return { ok: true as const }
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

export async function completeSyncPairing(syncCode: string, pairingCode: string) {
  const ownerToken = getOrCreateSyncOwnerToken(syncCode)
  const response = await fetch("/api/sync/pair/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncCode, pairingCode, ownerToken }),
  })
  const json = await responseJson(response)
  if (!response.ok) throw new Error(json.error || "Não foi possível concluir o pareamento.")
}
