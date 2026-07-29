"use client"

import { exportLabData, importLabData } from "./sync-client"
import {
  SyncLabPayloadSchema,
  type SyncLabId,
  type SyncLabPayload,
} from "./sync-schema"
import { getSyncOwnerToken } from "./sync-identity-client"

export const AUTO_SYNC_STATUS_EVENT = "vocablab-auto-sync-status"
export const SYNC_IDENTITY_UPDATED_EVENT = "vocablab-sync-identity-updated"
export const SYNC_DEVICE_ID_KEY = "vocablab_sync_device_id"

export type AutoSyncState = {
  state: "idle" | "connecting" | "synced" | "offline" | "conflict" | "error"
  message: string
  updatedAt?: number
  labs?: Partial<Record<SyncLabId, number>>
}

type Baseline = {
  key: string
  revision: number
  payload: SyncLabPayload
  updatedAt: number
}

const BASELINE_DB = "vocablab-auto-sync-db"
const BASELINE_STORE = "baselines"

function openBaselineDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BASELINE_DB, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BASELINE_STORE)) {
        request.result.createObjectStore(BASELINE_STORE, { keyPath: "key" })
      }
    }
  })
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function getBaseline(key: string) {
  const db = await openBaselineDb()
  try {
    const transaction = db.transaction(BASELINE_STORE, "readonly")
    const done = transactionDone(transaction)
    const value = await requestResult(transaction.objectStore(BASELINE_STORE).get(key))
    await done
    return value as Baseline | undefined
  } finally {
    db.close()
  }
}

async function putBaseline(value: Baseline) {
  const db = await openBaselineDb()
  try {
    const transaction = db.transaction(BASELINE_STORE, "readwrite")
    const done = transactionDone(transaction)
    transaction.objectStore(BASELINE_STORE).put(value)
    await done
  } finally {
    db.close()
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function payloadFingerprint(payload: SyncLabPayload) {
  return stable({ stores: payload.stores, preferences: payload.preferences })
}

function recordKey(value: unknown, index: number) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of ["id", "key", "questionId", "catalogId"]) {
      if (typeof record[key] === "string" || typeof record[key] === "number") {
        return `${key}:${String(record[key])}`
      }
    }
  }
  return `value:${stable(value)}:${index}`
}

function timestamp(value: unknown) {
  if (!value || typeof value !== "object") return 0
  const record = value as Record<string, unknown>
  for (const key of ["updatedAt", "modifiedAt", "answeredAt", "createdAt"]) {
    const raw = record[key]
    const parsed = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function mergeValue<T>(
  base: T | undefined,
  local: T | undefined,
  remote: T | undefined,
) {
  const baseHash = stable(base)
  const localHash = stable(local)
  const remoteHash = stable(remote)
  const localChanged = localHash !== baseHash
  const remoteChanged = remoteHash !== baseHash

  if (!localChanged) return remote
  if (!remoteChanged || localHash === remoteHash) return local
  if (local === undefined) return remote
  if (remote === undefined) return local
  return timestamp(remote) > timestamp(local) ? remote : local
}

function mergeStore(base: unknown[], local: unknown[], remote: unknown[]) {
  const toMap = (values: unknown[]) => new Map(
    values.map((value, index) => [recordKey(value, index), value]),
  )
  const baseMap = toMap(base)
  const localMap = toMap(local)
  const remoteMap = toMap(remote)
  const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()])
  const merged: unknown[] = []
  for (const key of keys) {
    const value = mergeValue(baseMap.get(key), localMap.get(key), remoteMap.get(key))
    if (value !== undefined) merged.push(value)
  }
  return merged
}

export function mergeLabPayloads(
  base: SyncLabPayload | undefined,
  local: SyncLabPayload,
  remote: SyncLabPayload,
) {
  const stores: Record<string, unknown[]> = {}
  const storeNames = new Set([
    ...Object.keys(base?.stores ?? {}),
    ...Object.keys(local.stores),
    ...Object.keys(remote.stores),
  ])
  for (const storeName of storeNames) {
    stores[storeName] = mergeStore(
      base?.stores[storeName] ?? [],
      local.stores[storeName] ?? [],
      remote.stores[storeName] ?? [],
    )
  }

  const preferences: Record<string, string> = {}
  const preferenceKeys = new Set([
    ...Object.keys(base?.preferences ?? {}),
    ...Object.keys(local.preferences),
    ...Object.keys(remote.preferences),
  ])
  for (const key of preferenceKeys) {
    const value = mergeValue(
      base?.preferences[key],
      local.preferences[key],
      remote.preferences[key],
    )
    if (value !== undefined) preferences[key] = value
  }

  return {
    version: 1,
    lab: local.lab,
    exportedAt: Date.now(),
    stores,
    preferences,
  } satisfies SyncLabPayload
}

export function getOrCreateSyncDeviceId() {
  const saved = localStorage.getItem(SYNC_DEVICE_ID_KEY)
  if (saved) return saved
  const generated = crypto.randomUUID()
  localStorage.setItem(SYNC_DEVICE_ID_KEY, generated)
  return generated
}

async function pullLab(syncCode: string, lab: SyncLabId, ownerToken: string) {
  const response = await fetch("/api/sync/lab/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncCode, lab, ownerToken }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json?.error || "Falha ao receber atualizações.")
  return {
    payload: json.payload ? SyncLabPayloadSchema.parse(json.payload) : null,
    revision: Number(json.revision ?? 0),
  }
}

async function pushLab(
  syncCode: string,
  lab: SyncLabId,
  payload: SyncLabPayload,
  expectedRevision: number,
  ownerToken: string,
) {
  const response = await fetch("/api/sync/lab/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      syncCode,
      lab,
      payload,
      expectedRevision,
      deviceId: getOrCreateSyncDeviceId(),
      ownerToken,
    }),
  })
  const json = await response.json().catch(() => ({}))
  if (response.status === 409) return null
  if (!response.ok) throw new Error(json?.error || "Falha ao enviar atualizações.")
  return Number(json.revision)
}

export async function synchronizeLab(syncCode: string, lab: SyncLabId) {
  const ownerToken = getSyncOwnerToken(syncCode)
  if (!ownerToken) throw new Error("Este navegador ainda não foi autorizado.")
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = `${syncCode}:${lab}`
    const [baseline, local, remoteState] = await Promise.all([
      getBaseline(key),
      exportLabData(lab),
      pullLab(syncCode, lab, ownerToken),
    ])

    if (!remoteState.payload) {
      const revision = await pushLab(syncCode, lab, local, 0, ownerToken)
      if (revision === null) continue
      await putBaseline({ key, revision, payload: local, updatedAt: Date.now() })
      return revision
    }

    const merged = mergeLabPayloads(baseline?.payload, local, remoteState.payload)
    if (payloadFingerprint(merged) !== payloadFingerprint(local)) {
      await importLabData(merged)
    }

    if (payloadFingerprint(merged) !== payloadFingerprint(remoteState.payload)) {
      const revision = await pushLab(
        syncCode,
        lab,
        merged,
        remoteState.revision,
        ownerToken,
      )
      if (revision === null) continue
      await putBaseline({ key, revision, payload: merged, updatedAt: Date.now() })
      return revision
    }

    await putBaseline({
      key,
      revision: remoteState.revision,
      payload: remoteState.payload,
      updatedAt: Date.now(),
    })
    return remoteState.revision
  }
  throw new Error("Houve atualizações simultâneas demais. A sincronização tentará novamente.")
}

export function publishAutoSyncState(state: AutoSyncState) {
  localStorage.setItem("vocablab_sync_status", JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(AUTO_SYNC_STATUS_EVENT, { detail: state }))
}
