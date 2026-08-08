"use client"

import { exportLabData, importLabData } from "./sync-client"
import {
  SyncLabPayloadSchema,
  SyncOperationSchema,
  type SyncLabId,
  type SyncLabPayload,
} from "./sync-schema"
import { getSyncOwnerToken } from "./sync-identity-client"
import { getOrCreateSyncDeviceId, getSyncDeviceKind, getSyncDeviceLabel, getSyncDeviceRole, setSyncDeviceRole } from "./sync-device"
import { applySyncOperationsState, diffLabPayload } from "./sync-operations"

export { getOrCreateSyncDeviceId } from "./sync-device"

export const AUTO_SYNC_STATUS_EVENT = "vocablab-auto-sync-status"
export const SYNC_IDENTITY_UPDATED_EVENT = "vocablab-sync-identity-updated"

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
  protocol?: number
  cursor?: number
  preferenceClocks?: Record<string, number>
}

// Bump this whenever the operation identity/merge rules change. Existing
// baselines are intentionally discarded so a device replays the shared log
// from cursor 0 instead of trusting a cursor produced by the old resolver.
const OPERATION_PROTOCOL = 4

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
  const stores = Object.fromEntries(
    Object.entries(payload.stores).map(([storeName, values]) => [
      storeName,
      [...values].sort((left, right) => {
        const leftKey = stable(left)
        const rightKey = stable(right)
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
      }),
    ]),
  )

  return stable({ stores, preferences: payload.preferences })
}

function studyStatePreservingPayload(remote: SyncLabPayload, local: SyncLabPayload) {
  const storeNames = remote.lab === "vocab" || remote.lab === "regency" || remote.lab === "rule"
    ? [remote.lab === "vocab" ? "flashcards" : "cards"]
    : []
  const stores = { ...remote.stores }
  for (const storeName of storeNames) {
    const localById = new Map((local.stores[storeName] ?? []).flatMap((value) => {
      if (!value || typeof value !== "object") return []
      const id = (value as Record<string, unknown>).id
      return typeof id === "string" ? [[id, value] as const] : []
    }))
    stores[storeName] = (remote.stores[storeName] ?? []).map((value) => {
      if (!value || typeof value !== "object") return value
      const id = (value as Record<string, unknown>).id
      const localValue = typeof id === "string" ? localById.get(id) : undefined
      if (!localValue || typeof localValue !== "object") return value
      const localRecord = localValue as Record<string, unknown>
      const remoteRecord = value as Record<string, unknown>
      const preserved: Record<string, unknown> = { ...remoteRecord }
      for (const key of ["studyStreak", "isReviewFolder"]) {
        if (key in localRecord) preserved[key] = localRecord[key]
      }
      return preserved
    })
  }
  return { ...remote, stores }
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
  for (const key of ["updatedAt", "modifiedAt", "answeredAt", "createdAt", "deletedAt"]) {
    const raw = record[key]
    const parsed = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function tombstoneEntityId(storeName: string, value: unknown) {
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  for (const key of ["id", "key", "questionId"]) {
    if (typeof record[key] === "string" || typeof record[key] === "number") {
      return String(record[key])
    }
  }
  return recordKey(storeName, value, 0)
}

function applyTombstones(stores: Record<string, unknown[]>) {
  const tombstones = (stores.syncTombstones ?? []).filter(
    (value): value is { storeName: string; entityId: string; deletedAt: number } => (
      Boolean(value)
      && typeof value === "object"
      && typeof (value as Record<string, unknown>).storeName === "string"
      && typeof (value as Record<string, unknown>).entityId === "string"
      && typeof (value as Record<string, unknown>).deletedAt === "number"
    ),
  )
  if (tombstones.length === 0) return stores
  const newest = new Map<string, number>()
  for (const tombstone of tombstones) {
    const key = `${tombstone.storeName}:${tombstone.entityId}`
    newest.set(key, Math.max(newest.get(key) ?? 0, tombstone.deletedAt))
  }
  for (const [storeName, values] of Object.entries(stores)) {
    if (storeName === "syncTombstones") continue
    stores[storeName] = values.filter((value) => {
      const deletedAt = newest.get(`${storeName}:${tombstoneEntityId(storeName, value)}`)
      return deletedAt === undefined || timestamp(value) > deletedAt
    })
  }
  return stores
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

function remapFolderColorPreference(value: string, aliases: Map<string, string>) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return value
    const remapped: Record<string, unknown> = {}
    for (const [folderId, color] of Object.entries(parsed)) {
      remapped[aliases.get(folderId) ?? folderId] = color
    }
    return JSON.stringify(remapped)
  } catch {
    return value
  }
}

function enforceStoreConstraints(storeName: string, values: unknown[]) {
  // VocabLab enforces a unique IndexedDB index for word + part of speech.
  // Two devices can still create that same card before their first sync; keep
  // the newest version here instead of letting the import transaction abort.
  if (storeName !== "flashcards") return values
  const byWordAndPartOfSpeech = new Map<string, unknown>()
  for (const value of values) {
    if (!value || typeof value !== "object") continue
    const record = value as Record<string, unknown>
    const word = typeof record.word === "string" ? record.word.trim().toLocaleLowerCase("en-US") : ""
    const partOfSpeech = typeof record.partOfSpeech === "string" ? record.partOfSpeech : ""
    if (!word || !partOfSpeech) {
      byWordAndPartOfSpeech.set(`record:${stable(value)}`, value)
      continue
    }
    const key = `${word}\u0000${partOfSpeech}`
    const existing = byWordAndPartOfSpeech.get(key)
    if (!existing || timestamp(value) >= timestamp(existing)) {
      byWordAndPartOfSpeech.set(key, value)
    }
  }
  return [...byWordAndPartOfSpeech.values()]
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
    stores[storeName] = enforceStoreConstraints(storeName, remapFolderReferences(mergeStore(
      storeName,
      base?.stores[storeName] ?? [],
      local.stores[storeName] ?? [],
      remote.stores[storeName] ?? [],
    ), aliases))
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
    if (value !== undefined) {
      preferences[key] = key.endsWith("_folder_colors")
        ? remapFolderColorPreference(value, aliases)
        : value
    }
  }

  stores.syncTombstones = mergeStore(
    "syncTombstones",
    base?.stores.syncTombstones ?? [],
    local.stores.syncTombstones ?? [],
    remote.stores.syncTombstones ?? [],
  )
  applyTombstones(stores)

  return {
    version: 1,
    lab: local.lab,
    exportedAt: Date.now(),
    stores,
    preferences,
  } satisfies SyncLabPayload
}

async function pullLab(syncCode: string, lab: SyncLabId, ownerToken: string) {
  const response = await fetch("/api/sync/lab/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      syncCode,
      lab,
      ownerToken,
      deviceId: getOrCreateSyncDeviceId(),
      deviceLabel: getSyncDeviceLabel(),
      deviceKind: getSyncDeviceKind(),
    }),
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
      deviceLabel: getSyncDeviceLabel(),
      deviceKind: getSyncDeviceKind(),
      ownerToken,
    }),
  })
  const json = await response.json().catch(() => ({}))
  if (response.status === 409) return null
  if (response.status === 403 && json?.code === "SYNC_DEVICE_READ_ONLY") {
    setSyncDeviceRole("study")
    return null
  }
  if (!response.ok) throw new Error(json?.error || "Falha ao enviar atualizações.")
  return Number(json.revision)
}

async function pushOperations(
  syncCode: string,
  lab: SyncLabId,
  ownerToken: string,
  operations: import("./sync-schema").SyncOperation[],
) {
  const response = await fetch("/api/sync/lab/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "push",
      syncCode,
      lab,
      ownerToken,
      operations,
      deviceId: getOrCreateSyncDeviceId(),
      deviceLabel: getSyncDeviceLabel(),
      deviceKind: getSyncDeviceKind(),
    }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json?.error || "Falha ao enviar as alterações.")
}

async function pullOperations(
  syncCode: string,
  lab: SyncLabId,
  ownerToken: string,
  cursor: number,
) {
  const response = await fetch("/api/sync/lab/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "pull",
      syncCode,
      lab,
      ownerToken,
      cursor,
      deviceId: getOrCreateSyncDeviceId(),
      deviceLabel: getSyncDeviceLabel(),
      deviceKind: getSyncDeviceKind(),
    }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json?.error || "Falha ao receber as alterações.")
  const operations = Array.isArray(json.operations)
    ? json.operations.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return []
      const value = entry as { operation?: unknown }
      const parsed = SyncOperationSchema.safeParse(value.operation)
      if (!parsed.success) return []
      return parsed.data.lab === lab ? [parsed.data] : []
    })
    : []
  return {
    operations,
    cursor: Number(json.cursor ?? cursor),
    hasMore: json.hasMore === true,
  }
}

async function synchronizeLabByOperations(syncCode: string, lab: SyncLabId) {
  const ownerToken = getSyncOwnerToken(syncCode)
  if (!ownerToken) throw new Error("Este navegador ainda não foi autorizado.")
  const key = `${syncCode}:${lab}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await getBaseline(key)
  const baseline = stored?.protocol === OPERATION_PROTOCOL ? stored : undefined
  const initialLocal = await exportLabData(lab)
  let local = initialLocal

  // Existing installations can still have their only copy in the old snapshot
  // tables. Merge it once, then publish it as independent operations.
  if (!baseline) {
    const legacy = await pullLab(syncCode, lab, ownerToken)
    if (legacy.payload) {
      local = mergeLabPayloads(undefined, initialLocal, legacy.payload)
      if (payloadFingerprint(local) !== payloadFingerprint(initialLocal)) {
        if (!await importLabData(local, initialLocal)) continue
      }
    }
  }

  const pending = diffLabPayload(baseline?.payload, local, getOrCreateSyncDeviceId())
  const preferenceClocks = { ...(baseline?.preferenceClocks ?? {}) }
  for (const operation of pending) {
    if (operation.kind.startsWith("preference-")) {
      preferenceClocks[operation.entityId] = Math.max(
        preferenceClocks[operation.entityId] ?? 0,
        operation.occurredAt,
      )
    }
  }
  for (let index = 0; index < pending.length; index += 250) {
    await pushOperations(syncCode, lab, ownerToken, pending.slice(index, index + 250))
  }

  let cursor = baseline?.cursor ?? 0
  const received: import("./sync-schema").SyncOperation[] = []
  for (;;) {
    const page = await pullOperations(syncCode, lab, ownerToken, cursor)
    received.push(...page.operations)
    cursor = page.cursor
    if (!page.hasMore) break
  }
  const mergedState = applySyncOperationsState(local, received, preferenceClocks)
  const merged = mergedState.payload
  const current = await exportLabData(lab)
  // A user action or catalog initialization raced this cycle. Do not advance
  // the baseline or report success; retry from the new local state.
  if (payloadFingerprint(current) !== payloadFingerprint(local)) continue
  if (payloadFingerprint(merged) !== payloadFingerprint(current)) {
    if (!await importLabData(merged, current)) continue
  }
  // Verify the actual IndexedDB/localStorage state after importing. This
  // prevents a false green status when an import was rejected or raced.
  const finalLocal = await exportLabData(lab)
  if (payloadFingerprint(finalLocal) !== payloadFingerprint(merged)) continue
  await putBaseline({
    key,
    revision: cursor,
    cursor,
    protocol: OPERATION_PROTOCOL,
    payload: finalLocal,
    preferenceClocks: mergedState.preferenceClocks,
    updatedAt: Date.now(),
  })
    return cursor
  }
  throw new Error("A sincronizacao nao convergiu apos 3 tentativas. O estado nao foi marcado como sincronizado.")
}

async function synchronizeLabUnlocked(syncCode: string, lab: SyncLabId) {
  const ownerToken = getSyncOwnerToken(syncCode)
  if (!ownerToken) throw new Error("Este navegador ainda não foi autorizado.")
  const key = `${syncCode}:${lab}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const studyOnly = getSyncDeviceRole() === "study"
    const [baseline, local, remoteState] = await Promise.all([
      getBaseline(key),
      exportLabData(lab),
      pullLab(syncCode, lab, ownerToken),
    ])

    if (!remoteState.payload) {
      if (studyOnly) return 0
      const revision = await pushLab(syncCode, lab, local, 0, ownerToken)
      if (revision === null) continue
      await putBaseline({ key, revision, payload: local, updatedAt: Date.now() })
      return revision
    }

    // Pulling the remote data is asynchronous. Re-read immediately before an
    // import so a folder/card created during the request cannot be overwritten
    // by the old local snapshot captured above.
    const currentLocal = await exportLabData(lab)
    if (payloadFingerprint(currentLocal) !== payloadFingerprint(local)) continue

    const merged = mergeLabPayloads(baseline?.payload, currentLocal, remoteState.payload)
    if (studyOnly) {
      const studyPayload = studyStatePreservingPayload(remoteState.payload, currentLocal)
      if (payloadFingerprint(studyPayload) !== payloadFingerprint(currentLocal)) {
        const imported = await importLabData(studyPayload, currentLocal)
        if (!imported) continue
      }
      await putBaseline({
        key,
        revision: remoteState.revision,
        payload: studyPayload,
        updatedAt: Date.now(),
      })
      return remoteState.revision
    }
    if (payloadFingerprint(merged) !== payloadFingerprint(currentLocal)) {
      const imported = await importLabData(merged, currentLocal)
      if (!imported) continue
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
  // A second tab or a background request can still win the revision between
  // the final pull and push. Adopt the newest remote state and let the next
  // scheduled cycle publish any remaining local change instead of surfacing a
  // persistent error for a recoverable race.
  try {
    const latest = await pullLab(syncCode, lab, ownerToken)
    if (latest.payload) {
      const latestLocal = await exportLabData(lab)
      const latestBaseline = await getBaseline(key)
      const latestMerged = getSyncDeviceRole() === "study"
        ? studyStatePreservingPayload(latest.payload, latestLocal)
        : mergeLabPayloads(latestBaseline?.payload, latestLocal, latest.payload)
      if (payloadFingerprint(latestMerged) !== payloadFingerprint(latestLocal)) {
        await importLabData(latestMerged, latestLocal)
      }
      await putBaseline({ key, revision: latest.revision, payload: latestMerged, updatedAt: Date.now() })
      return latest.revision
    }
  } catch {
    // Preserve the original error only when the recovery pull also fails.
  }
  throw new Error("Houve atualizações simultâneas demais. A sincronização tentará novamente.")
}

export async function synchronizeLab(syncCode: string, lab: SyncLabId) {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    const lockManager = (navigator as Navigator & { locks: LockManager }).locks
    const result = await lockManager.request(
      `vocablab-sync:${syncCode}:${lab}`,
      { ifAvailable: true },
      async (lock) => lock ? synchronizeLabByOperations(syncCode, lab) : null,
    )
    // Another tab is already synchronizing this Lab. It will publish the
    // result; skipping here avoids two writers racing on the same revision.
    return result ?? 0
  }
  return synchronizeLabByOperations(syncCode, lab)
}

export function publishAutoSyncState(state: AutoSyncState) {
  localStorage.setItem("vocablab_sync_status", JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(AUTO_SYNC_STATUS_EVENT, { detail: state }))
}
