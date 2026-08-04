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
    for (const key of ["id", "key", "questionId", "catalogId"]) {
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
    const index = values.findIndex((value, itemIndex) => syncEntityId(value, itemIndex) === operation.entityId)
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

  applyTombstones(stores)
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
