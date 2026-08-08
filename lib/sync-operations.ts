import type { SyncLabPayload, SyncOperation } from "@/lib/sync-schema"

const RECORD_TIME_KEYS = ["updatedAt", "modifiedAt", "answeredAt", "createdAt", "deletedAt"]

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

export function syncEntityId(value: unknown, fallback: number) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    // Catalog entries are installed independently on every device and receive
    // a random local `id`. The catalog id is the stable cross-device identity.
    for (const key of ["catalogId", "id", "key", "questionId"]) {
      if (typeof record[key] === "string" || typeof record[key] === "number") {
        return `${key}:${String(record[key])}`
      }
    }
  }
  return `value:${hash(stable(value))}:${fallback}`
}

export function syncRecordTimestamp(value: unknown, fallback = Date.now()) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of RECORD_TIME_KEYS) {
      const raw = record[key]
      const parsed = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""))
      if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed)
    }
  }
  return fallback
}

function maps(values: unknown[]) {
  return new Map(values.map((value, index) => [syncEntityId(value, index), value]))
}

function createOperationId(deviceId: string, operation: Omit<SyncOperation, "operationId">) {
  return `${deviceId}-${operation.lab}-${hash(stable(operation))}-${operation.occurredAt.toString(36)}`
}

/**
 * Converts only the local changes since the last acknowledged payload into
 * idempotent record operations. No Lab-wide snapshot is sent to the server.
 */
export function diffLabPayload(
  base: SyncLabPayload | undefined,
  local: SyncLabPayload,
  deviceId: string,
) {
  const operations: SyncOperation[] = []
  const storeNames = new Set([
    ...Object.keys(base?.stores ?? {}),
    ...Object.keys(local.stores),
  ])

  for (const storeName of storeNames) {
    const before = maps(base?.stores[storeName] ?? [])
    const after = maps(local.stores[storeName] ?? [])
    for (const [entityId, value] of after) {
      if (stable(before.get(entityId)) === stable(value)) continue
      const operation = {
        lab: local.lab,
        kind: "upsert" as const,
        storeName,
        entityId,
        value,
        occurredAt: syncRecordTimestamp(value, local.exportedAt),
      }
      operations.push({ ...operation, operationId: createOperationId(deviceId, operation) })
    }
    for (const [entityId, value] of before) {
      if (after.has(entityId)) continue
      const operation = {
        lab: local.lab,
        kind: "delete" as const,
        storeName,
        entityId,
        occurredAt: Math.max(syncRecordTimestamp(value, 0), local.exportedAt),
      }
      operations.push({ ...operation, operationId: createOperationId(deviceId, operation) })
    }
  }

  const preferenceKeys = new Set([
    ...Object.keys(base?.preferences ?? {}),
    ...Object.keys(local.preferences),
  ])
  for (const entityId of preferenceKeys) {
    const before = base?.preferences[entityId]
    const value = local.preferences[entityId]
    if (before === value) continue
    const operation = value === undefined
      ? { lab: local.lab, kind: "preference-delete" as const, entityId, occurredAt: local.exportedAt }
      : { lab: local.lab, kind: "preference-set" as const, entityId, value, occurredAt: local.exportedAt }
    operations.push({ ...operation, operationId: createOperationId(deviceId, operation) })
  }

  return operations.sort((left, right) => left.occurredAt - right.occurredAt || left.operationId.localeCompare(right.operationId))
}

function makeTombstone(storeName: string, entityId: string, deletedAt: number) {
  return {
    id: `operation:${storeName}:${entityId}:${deletedAt}`,
    storeName,
    entityId: entityId.replace(/^(id|key|questionId|catalogId):/, ""),
    deletedAt,
  }
}

function tombstoneKey(value: unknown) {
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  return typeof record.storeName === "string" && typeof record.entityId === "string"
    ? `${record.storeName}:${record.entityId}`
    : ""
}

function applyTombstones(stores: Record<string, unknown[]>) {
  const newest = new Map<string, number>()
  for (const value of stores.syncTombstones ?? []) {
    if (!value || typeof value !== "object") continue
    const record = value as Record<string, unknown>
    const key = tombstoneKey(value)
    const deletedAt = typeof record.deletedAt === "number" ? record.deletedAt : 0
    if (key) newest.set(key, Math.max(newest.get(key) ?? 0, deletedAt))
  }
  for (const [storeName, values] of Object.entries(stores)) {
    if (storeName === "syncTombstones") continue
    stores[storeName] = values.filter((value, index) => {
      const entityId = syncEntityId(value, index).replace(/^(id|key|questionId|catalogId):/, "")
      const deletedAt = newest.get(`${storeName}:${entityId}`)
      return deletedAt === undefined || syncRecordTimestamp(value, 0) > deletedAt
    })
  }
}

const FOLDER_STORE_NAMES = new Set(["folders", "grammarFolders"])

function normalizedFolderName(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : ""
}

function remapFolderReferences(
  stores: Record<string, unknown[]>,
  aliases: Map<string, string>,
) {
  if (aliases.size === 0) return

  for (const [storeName, values] of Object.entries(stores)) {
    stores[storeName] = values.map((value) => {
      if (!value || typeof value !== "object") return value
      const record = value as Record<string, unknown>
      if (typeof record.folderId !== "string") return value
      const canonicalId = aliases.get(record.folderId)
      return canonicalId && canonicalId !== record.folderId
        ? { ...record, folderId: canonicalId }
        : value
    })
  }

  // A deletion operation may have created a tombstone for the duplicate
  // folder id. Keep that tombstone attached to the surviving local folder.
  if (stores.syncTombstones) {
    stores.syncTombstones = stores.syncTombstones.map((value) => {
      if (!value || typeof value !== "object") return value
      const tombstone = value as Record<string, unknown>
      if (
        typeof tombstone.storeName !== "string"
        || !FOLDER_STORE_NAMES.has(tombstone.storeName)
        || typeof tombstone.entityId !== "string"
      ) return value
      const canonicalId = aliases.get(tombstone.entityId)
      return canonicalId ? { ...tombstone, entityId: canonicalId } : value
    })
  }
}

function remapFolderColorPreferences(
  preferences: Record<string, string>,
  aliases: Map<string, string>,
) {
  if (aliases.size === 0) return
  for (const [key, value] of Object.entries(preferences)) {
    if (!key.endsWith("_folder_colors")) continue
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue
      const remapped: Record<string, unknown> = {}
      for (const [folderId, color] of Object.entries(parsed)) {
        remapped[aliases.get(folderId) ?? folderId] = color
      }
      preferences[key] = JSON.stringify(remapped)
    } catch {
      // A malformed visual preference must not prevent card synchronization.
    }
  }
}

/**
 * New browsers create built-in folders/cards before the first remote pull.
 * Those records have device-local ids and can collide with the same built-in
 * records created on another device. Normalize them before IndexedDB import.
 */
function normalizeOperationState(
  stores: Record<string, unknown[]>,
  preferences: Record<string, string>,
) {
  const folderAliases = new Map<string, string>()
  for (const storeName of FOLDER_STORE_NAMES) {
    const values = stores[storeName]
    if (!values) continue
    const canonicalByName = new Map<string, string>()
    const deduped: unknown[] = []
    for (const value of values) {
      if (!value || typeof value !== "object") {
        deduped.push(value)
        continue
      }
      const folder = value as Record<string, unknown>
      const id = typeof folder.id === "string" ? folder.id : ""
      const name = normalizedFolderName(folder.name)
      if (!id || !name) {
        deduped.push(value)
        continue
      }
      const canonicalId = canonicalByName.get(name)
      if (!canonicalId) {
        canonicalByName.set(name, id)
        deduped.push(value)
        continue
      }
      if (canonicalId !== id) folderAliases.set(id, canonicalId)
    }
    stores[storeName] = deduped
  }

  remapFolderReferences(stores, folderAliases)
  remapFolderColorPreferences(preferences, folderAliases)

  // VocabLab has a unique IndexedDB index for word + part of speech. Keep the
  // newest record when old operation rows or simultaneous device creation
  // produce two records for that key.
  const flashcards = stores.flashcards
  if (flashcards) {
    const byWordAndPartOfSpeech = new Map<string, { index: number; value: unknown }>()
    const deduped: unknown[] = []
    for (const value of flashcards) {
      if (!value || typeof value !== "object") {
        deduped.push(value)
        continue
      }
      const record = value as Record<string, unknown>
      const word = typeof record.word === "string" ? record.word.trim().toLocaleLowerCase("en-US") : ""
      const partOfSpeech = typeof record.partOfSpeech === "string" ? record.partOfSpeech : ""
      if (!word || !partOfSpeech) {
        deduped.push(value)
        continue
      }
      const uniqueKey = `${word}\u0000${partOfSpeech}`
      const existing = byWordAndPartOfSpeech.get(uniqueKey)
      if (!existing) {
        byWordAndPartOfSpeech.set(uniqueKey, { index: deduped.length, value })
        deduped.push(value)
        continue
      }
      if (syncRecordTimestamp(value, 0) >= syncRecordTimestamp(existing.value, 0)) {
        deduped[existing.index] = value
        existing.value = value
      }
    }
    stores.flashcards = deduped
  }

  applyTombstones(stores)
}

function findOperationEntityIndex(
  values: unknown[],
  operation: SyncOperation,
) {
  const exactIndex = values.findIndex((value, itemIndex) => syncEntityId(value, itemIndex) === operation.entityId)
  if (exactIndex >= 0) return exactIndex

  // Operations written by protocol v3 before catalogId became the preferred
  // identity used `id:<random-device-id>`. Match those legacy rows by their
  // stable catalog id so an upgrade cannot create duplicate built-in cards.
  if (operation.kind === "upsert" && operation.value && typeof operation.value === "object") {
    const catalogId = (operation.value as Record<string, unknown>).catalogId
    if (typeof catalogId === "string" || typeof catalogId === "number") {
      return values.findIndex((value) => (
        Boolean(value)
        && typeof value === "object"
        && String((value as Record<string, unknown>).catalogId ?? "") === String(catalogId)
      ))
    }
  }
  return -1
}

export type SyncOperationState = {
  payload: SyncLabPayload
  preferenceClocks: Record<string, number>
}

/** Applies operations with last-write-wins clocks for records and preferences. */
export function applySyncOperationsState(
  local: SyncLabPayload,
  operations: SyncOperation[],
  initialPreferenceClocks: Record<string, number> = {},
): SyncOperationState {
  const stores: Record<string, unknown[]> = Object.fromEntries(
    Object.entries(local.stores).map(([name, values]) => [name, [...values]]),
  )
  const preferences = { ...local.preferences }
  const preferenceClocks = { ...initialPreferenceClocks }

  for (const operation of operations) {
    if (operation.lab !== local.lab) continue
    if (operation.kind === "preference-set") {
      if ((preferenceClocks[operation.entityId] ?? 0) > operation.occurredAt) continue
      preferences[operation.entityId] = String(operation.value ?? "")
      preferenceClocks[operation.entityId] = operation.occurredAt
      continue
    }
    if (operation.kind === "preference-delete") {
      if ((preferenceClocks[operation.entityId] ?? 0) > operation.occurredAt) continue
      delete preferences[operation.entityId]
      preferenceClocks[operation.entityId] = operation.occurredAt
      continue
    }
    if (!operation.storeName) continue
    const values = stores[operation.storeName] ?? []
    const index = findOperationEntityIndex(values, operation)
    if (operation.kind === "upsert") {
      const current = index >= 0 ? values[index] : undefined
      if (current !== undefined && syncRecordTimestamp(current, 0) > operation.occurredAt) continue
      const next = [...values]
      if (index >= 0) next[index] = operation.value
      else next.push(operation.value)
      stores[operation.storeName] = next
      continue
    }
    const current = index >= 0 ? values[index] : undefined
    if (current !== undefined && syncRecordTimestamp(current, 0) > operation.occurredAt) continue
    const next = values.filter((value, itemIndex) => syncEntityId(value, itemIndex) !== operation.entityId)
    stores[operation.storeName] = next
    const tombstones = stores.syncTombstones ?? []
    const tombstone = makeTombstone(operation.storeName, operation.entityId, operation.occurredAt)
    const existingIndex = tombstones.findIndex((value) => tombstoneKey(value) === `${tombstone.storeName}:${tombstone.entityId}`)
    if (existingIndex >= 0) {
      const existing = tombstones[existingIndex] as { deletedAt?: number }
      if ((existing.deletedAt ?? 0) >= tombstone.deletedAt) continue
      stores.syncTombstones = tombstones.map((value, itemIndex) => itemIndex === existingIndex ? tombstone : value)
    } else {
      stores.syncTombstones = [...tombstones, tombstone]
    }
  }

  normalizeOperationState(stores, preferences)
  return {
    payload: { ...local, exportedAt: Date.now(), stores, preferences },
    preferenceClocks,
  }
}

/** Compatibility helper for callers that only need the merged payload. */
export function applySyncOperations(
  local: SyncLabPayload,
  operations: SyncOperation[],
  initialPreferenceClocks: Record<string, number> = {},
) {
  return applySyncOperationsState(local, operations, initialPreferenceClocks).payload
}
