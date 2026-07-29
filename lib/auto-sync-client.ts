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
    transaction.onerror = (event) => {
      const requestError = event.target && "error" in event.target
        ? (event.target as IDBRequest).error
        : null
      reject(requestError ?? transaction.error ?? new Error("A transação de sincronização falhou."))
    }
    transaction.onabort = () => reject(
      transaction.error ?? new Error("A transação de sincronização foi cancelada."),
    )
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

function recordKey(storeName: string, value: unknown, index: number) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record.catalogId === "string" || typeof record.catalogId === "number") {
      return `catalogId:${String(record.catalogId)}`
    }
    if (storeName === "folders" && typeof record.name === "string") {
      return `name:${record.name.trim().toLocaleLowerCase()}`
    }
    for (const key of ["id", "key", "questionId"]) {
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

function mergeStore(
  storeName: string,
  base: unknown[],
  local: unknown[],
  remote: unknown[],
) {
  const toMap = (values: unknown[]) => new Map(
    values.map((value, index) => [recordKey(storeName, value, index), value]),
  )
  const baseMap = toMap(base)
  const localMap = toMap(local)
  const remoteMap = toMap(remote)
  const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()])
  const merged: unknown[] = []
  for (const key of keys) {
    const hasNoBaseline = !baseMap.has(key)
    const existsOnBothSides = localMap.has(key) && remoteMap.has(key)
    const value = hasNoBaseline && existsOnBothSides
      ? remoteMap.get(key)
      : mergeValue(baseMap.get(key), localMap.get(key), remoteMap.get(key))
    if (value !== undefined) merged.push(value)
  }
  return merged
}

function folderAliases(
  sources: unknown[][],
  mergedFolders: unknown[],
) {
  const canonicalByName = new Map<string, string>()
  for (const value of mergedFolders) {
    if (!value || typeof value !== "object") continue
    const folder = value as Record<string, unknown>
    if (typeof folder.id !== "string" || typeof folder.name !== "string") continue
    canonicalByName.set(folder.name.trim().toLocaleLowerCase(), folder.id)
  }

  const aliases = new Map<string, string>()
  for (const values of sources) {
    for (const value of values) {
      if (!value || typeof value !== "object") continue
      const folder = value as Record<string, unknown>
      if (typeof folder.id !== "string" || typeof folder.name !== "string") continue
      const canonicalId = canonicalByName.get(folder.name.trim().toLocaleLowerCase())
      if (canonicalId) aliases.set(folder.id, canonicalId)
    }
  }
  return aliases
}

function remapFolderReferences(values: unknown[], aliases: Map<string, string>) {
  return values.map((value) => {
    if (!value || typeof value !== "object") return value
    const record = value as Record<string, unknown>
    if (typeof record.folderId !== "string") return value
    const canonicalId = aliases.get(record.folderId)
    return canonicalId && canonicalId !== record.folderId
      ? { ...record, folderId: canonicalId }
      : value
  })
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
  if (storeNames.has("folders")) {
    stores.folders = mergeStore(
      "folders",
      base?.stores.folders ?? [],
      local.stores.folders ?? [],
      remote.stores.folders ?? [],
    )
  }
  const aliases = folderAliases(
    [
      base?.stores.folders ?? [],
      local.stores.folders ?? [],
      remote.stores.folders ?? [],
    ],
    stores.folders ?? [],
  )
  for (const storeName of storeNames) {
    if (storeName === "folders") continue
    stores[storeName] = remapFolderReferences(mergeStore(
      storeName,
      base?.stores[storeName] ?? [],
      local.stores[storeName] ?? [],
      remote.stores[storeName] ?? [],
    ), aliases)
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
