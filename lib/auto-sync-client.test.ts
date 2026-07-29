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
})
