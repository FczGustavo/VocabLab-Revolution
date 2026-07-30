import { describe, expect, it } from "vitest"
import { mergeLabPayloads } from "./auto-sync-client"
import type { SyncLabPayload } from "./sync-schema"

function payload(stores: SyncLabPayload["stores"]): SyncLabPayload {
  return {
    version: 1,
    lab: "vocab",
    exportedAt: 1,
    stores,
    preferences: {},
  }
}

describe("mergeLabPayloads", () => {
  it("preserves independent cards created concurrently", () => {
    const merged = mergeLabPayloads(
      payload({ flashcards: [] }),
      payload({ flashcards: [{ id: "local", word: "work" }] }),
      payload({ flashcards: [{ id: "remote", word: "study" }] }),
    )

    expect(merged.stores.flashcards).toHaveLength(2)
    expect(merged.stores.flashcards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "local" }),
      expect.objectContaining({ id: "remote" }),
    ]))
  })

  it("keeps a concurrent edit instead of an unrelated deletion", () => {
    const base = payload({ flashcards: [{ id: "1", word: "old", updatedAt: 1 }] })
    const merged = mergeLabPayloads(
      base,
      payload({ flashcards: [] }),
      payload({ flashcards: [{ id: "1", word: "new", updatedAt: 2 }] }),
    )

    expect(merged.stores.flashcards).toEqual([
      expect.objectContaining({ id: "1", word: "new" }),
    ])
  })

  it("uses the newest timestamp when the same card changes twice", () => {
    const base = payload({ flashcards: [{ id: "1", word: "base", updatedAt: 1 }] })
    const merged = mergeLabPayloads(
      base,
      payload({ flashcards: [{ id: "1", word: "local", updatedAt: 2 }] }),
      payload({ flashcards: [{ id: "1", word: "remote", updatedAt: 3 }] }),
    )

    expect(merged.stores.flashcards).toEqual([
      expect.objectContaining({ word: "remote" }),
    ])
  })

  it("deduplicates generated catalog cards by catalogId on a new device", () => {
    const merged = mergeLabPayloads(
      undefined,
      payload({
        folders: [{ id: "local-folder", name: "Phrasal Verbs Essentials" }],
        flashcards: [{
          id: "local-random-id",
          catalogId: "pv-work-out",
          folderId: "local-folder",
          word: "work out",
          partOfSpeech: "phrasal-verb",
        }],
      }),
      payload({
        folders: [{ id: "remote-folder", name: "Phrasal Verbs Essentials" }],
        flashcards: [{
          id: "remote-random-id",
          catalogId: "pv-work-out",
          folderId: "remote-folder",
          word: "work out",
          partOfSpeech: "phrasal-verb",
        }],
      }),
    )

    expect(merged.stores.folders).toEqual([
      expect.objectContaining({ id: "remote-folder" }),
    ])
    expect(merged.stores.flashcards).toEqual([
      expect.objectContaining({
        id: "remote-random-id",
        folderId: "remote-folder",
      }),
    ])
  })

  it("remaps local records when equal folder names have different device IDs", () => {
    const merged = mergeLabPayloads(
      undefined,
      payload({
        folders: [{ id: "local-folder", name: "Shared" }],
        flashcards: [{ id: "local-card", folderId: "local-folder", word: "local" }],
      }),
      payload({
        folders: [{ id: "remote-folder", name: "Shared" }],
        flashcards: [{ id: "remote-card", folderId: "remote-folder", word: "remote" }],
      }),
    )

    expect(merged.stores.flashcards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "local-card", folderId: "remote-folder" }),
      expect.objectContaining({ id: "remote-card", folderId: "remote-folder" }),
    ]))
  })

  it("preserves a newly created folder and its moved card against an older remote snapshot", () => {
    const base = payload({
      folders: [{ id: "source", name: "Source", createdAt: 1 }],
      flashcards: [{ id: "card", word: "work", partOfSpeech: "verb", folderId: "source", updatedAt: 1 }],
    })
    const merged = mergeLabPayloads(
      base,
      payload({
        folders: [
          { id: "source", name: "Source", createdAt: 1 },
          { id: "destination", name: "Destination", createdAt: 2 },
        ],
        flashcards: [{ id: "card", word: "work", partOfSpeech: "verb", folderId: "destination", updatedAt: 2 }],
      }),
      base,
    )

    expect(merged.stores.folders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "destination", name: "Destination" }),
    ]))
    expect(merged.stores.flashcards).toEqual([
      expect.objectContaining({ id: "card", folderId: "destination" }),
    ])
  })
})
