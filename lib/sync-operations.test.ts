import { describe, expect, it } from "vitest"
import { applySyncOperations, diffLabPayload, syncEntityId } from "./sync-operations"
import type { SyncLabPayload } from "./sync-schema"

const payload = (flashcards: unknown[] = [], preferences: Record<string, string> = {}): SyncLabPayload => ({
  version: 1,
  lab: "vocab",
  exportedAt: 1_000,
  stores: { flashcards, syncTombstones: [] },
  preferences,
})

describe("multiwriter sync operations", () => {
  it("uses catalogId instead of a device-local random card id", () => {
    expect(syncEntityId({ id: "pc-random-id", catalogId: "catalog-work" }, 0)).toBe("catalogId:catalog-work")
  })

  it("imports a new device without colliding with its local catalog folders/cards", () => {
    const local: SyncLabPayload = {
      version: 1,
      lab: "vocab",
      exportedAt: 1_000,
      stores: {
        folders: [{ id: "phone-folder", name: "Phrasal Verbs Essentials", createdAt: 100 }],
        flashcards: [{ id: "phone-catalog-card", catalogId: "catalog-work", word: "work out", partOfSpeech: "phrasal-verb", folderId: "phone-folder", createdAt: 100 }],
        syncTombstones: [],
      },
      preferences: {},
    }
    const merged = applySyncOperations(local, [
      {
        operationId: "pc-device-vocab-folder-1",
        lab: "vocab",
        kind: "upsert",
        storeName: "folders",
        entityId: "id:pc-folder",
        value: { id: "pc-folder", name: "Phrasal Verbs Essentials", createdAt: 90 },
        occurredAt: 90,
      },
      {
        operationId: "pc-device-vocab-card-1",
        lab: "vocab",
        kind: "upsert",
        storeName: "flashcards",
        // This is the id format persisted by early protocol-v3 clients.
        entityId: "id:pc-catalog-card",
        value: { id: "pc-catalog-card", catalogId: "catalog-work", word: "work out", partOfSpeech: "phrasal-verb", folderId: "pc-folder", createdAt: 110 },
        occurredAt: 110,
      },
      {
        operationId: "pc-device-vocab-personal-1",
        lab: "vocab",
        kind: "upsert",
        storeName: "flashcards",
        entityId: "id:pc-personal-card",
        value: { id: "pc-personal-card", word: "carry on", partOfSpeech: "phrasal-verb", folderId: "pc-folder", createdAt: 200 },
        occurredAt: 200,
      },
    ])

    expect(merged.stores.folders).toEqual([
      expect.objectContaining({ id: "phone-folder", name: "Phrasal Verbs Essentials" }),
    ])
    expect(merged.stores.flashcards).toHaveLength(2)
    expect(merged.stores.flashcards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "pc-catalog-card", catalogId: "catalog-work", folderId: "phone-folder" }),
      expect.objectContaining({ id: "pc-personal-card", folderId: "phone-folder" }),
    ]))
  })

  it("sends only the changed record instead of the Lab snapshot", () => {
    const before = payload([{ id: "a", word: "old", updatedAt: 100 }])
    const after = payload([
      { id: "a", word: "new", updatedAt: 200 },
      { id: "b", word: "added", updatedAt: 200 },
    ])
    const operations = diffLabPayload(before, after, "device-12345678")

    expect(operations).toHaveLength(2)
    expect(operations.every((operation) => operation.kind === "upsert")).toBe(true)
    expect(operations.map((operation) => operation.entityId)).toEqual(["id:a", "id:b"])
  })

  it("keeps a newer local edit when an older remote operation arrives", () => {
    const local = payload([{ id: "a", word: "local", updatedAt: 300 }])
    const merged = applySyncOperations(local, [{
      operationId: "device-12345678-vocab-remote-1",
      lab: "vocab",
      kind: "upsert",
      storeName: "flashcards",
      entityId: "id:a",
      value: { id: "a", word: "remote", updatedAt: 200 },
      occurredAt: 200,
    }])

    expect(merged.stores.flashcards).toEqual([{ id: "a", word: "local", updatedAt: 300 }])
  })

  it("propagates a card's Review marker to every paired device", () => {
    const local = payload([{ id: "a", word: "bank", isReviewFolder: false, updatedAt: 100 }])
    const merged = applySyncOperations(local, [{
      operationId: "device-12345678-vocab-review-1",
      lab: "vocab",
      kind: "upsert",
      storeName: "flashcards",
      entityId: "id:a",
      value: { id: "a", word: "bank", isReviewFolder: true, updatedAt: 200 },
      occurredAt: 200,
    }])

    expect(merged.stores.flashcards).toEqual([
      { id: "a", word: "bank", isReviewFolder: true, updatedAt: 200 },
    ])
  })

  it("propagates deletions as tombstones so another device cannot resurrect a card", () => {
    const local = payload([{ id: "a", word: "card", updatedAt: 100 }])
    const merged = applySyncOperations(local, [{
      operationId: "device-12345678-vocab-delete-1",
      lab: "vocab",
      kind: "delete",
      storeName: "flashcards",
      entityId: "id:a",
      occurredAt: 400,
    }])

    expect(merged.stores.flashcards).toEqual([])
    expect(merged.stores.syncTombstones).toContainEqual(expect.objectContaining({
      storeName: "flashcards",
      entityId: "a",
      deletedAt: 400,
    }))
  })

  it("keeps a newer local edit when an older remote deletion arrives", () => {
    const local = payload([{ id: "a", word: "newer edit", updatedAt: 500 }])
    const merged = applySyncOperations(local, [{
      operationId: "device-12345678-vocab-delete-old",
      lab: "vocab",
      kind: "delete",
      storeName: "flashcards",
      entityId: "id:a",
      occurredAt: 300,
    }])

    expect(merged.stores.flashcards).toEqual([{ id: "a", word: "newer edit", updatedAt: 500 }])
    expect(merged.stores.syncTombstones).toEqual([])
  })

  it("keeps a newer preference when an older remote preference arrives later", () => {
    const local = payload([], { theme: "newer" })
    const merged = applySyncOperations(local, [{
      operationId: "device-12345678-vocab-pref-old",
      lab: "vocab",
      kind: "preference-set",
      entityId: "theme",
      value: "older",
      occurredAt: 300,
    }], { theme: 500 })

    expect(merged.preferences.theme).toBe("newer")
  })
})
