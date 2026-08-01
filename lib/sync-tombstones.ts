"use client"

export type SyncTombstone = {
  id: string
  storeName: string
  entityId: string
  deletedAt: number
}

const STORAGE_KEY = "vocablab_sync_tombstones"

function readAll(): Record<string, SyncTombstone[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    return parsed && typeof parsed === "object" ? parsed as Record<string, SyncTombstone[]> : {}
  } catch {
    return {}
  }
}

function writeAll(value: Record<string, SyncTombstone[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export function getSyncTombstones(lab: string): SyncTombstone[] {
  return (readAll()[lab] ?? []).filter((item) => (
    item && typeof item.id === "string" && typeof item.storeName === "string"
    && typeof item.entityId === "string" && Number.isFinite(item.deletedAt)
  ))
}

export function recordSyncTombstone(lab: string, storeName: string, entityId: string) {
  if (!lab || !storeName || !entityId) return
  const all = readAll()
  const current = getSyncTombstones(lab)
  const id = `${storeName}:${entityId}`
  const next = current.filter((item) => item.id !== id)
  next.push({ id, storeName, entityId, deletedAt: Date.now() })
  all[lab] = next.slice(-5000)
  writeAll(all)
}

export function replaceSyncTombstones(lab: string, values: SyncTombstone[]) {
  const all = readAll()
  const valid = values.filter((value) => (
    value && typeof value.id === "string" && typeof value.storeName === "string"
    && typeof value.entityId === "string" && Number.isFinite(value.deletedAt)
  ))
  const deduped = new Map(valid.map((value) => [value.id, value]))
  all[lab] = [...deduped.values()].sort((left, right) => left.deletedAt - right.deletedAt).slice(-5000)
  writeAll(all)
}

export function clearSyncTombstones() {
  localStorage.removeItem(STORAGE_KEY)
}
