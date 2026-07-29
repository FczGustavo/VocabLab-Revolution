import { describe, expect, it } from "vitest"
import {
  normalizeSyncCode,
  normalizeSyncWord,
  SyncSnapshotSchema,
} from "./sync-schema"

describe("sync identifiers", () => {
  it("normalizes the user word and preserves a four-digit PIN", () => {
    expect(normalizeSyncWord("  São Paulo!  ")).toBe("saopaulo")
    expect(normalizeSyncCode("  MinhaNuvem-0042 ")).toBe("minhanuvem-0042")
  })

  it("rejects malformed or weakly structured codes", () => {
    expect(normalizeSyncCode("a-1234")).toBe("")
    expect(normalizeSyncCode("backup-123")).toBe("")
    expect(normalizeSyncCode("backup-12345")).toBe("")
  })
})

describe("sync snapshot", () => {
  it("accepts the versioned all-lab payload", () => {
    const parsed = SyncSnapshotSchema.safeParse({
      version: 2,
      exportedAt: Date.now(),
      databases: {
        "vocab-lab-db": { flashcards: [{ id: "one" }] },
        "regencylab-db": { cards: [] },
      },
      preferences: { "vocablab_view_mode": "list" },
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects unbounded stores and unknown schema versions", () => {
    expect(SyncSnapshotSchema.safeParse({
      version: 1,
      exportedAt: Date.now(),
      databases: {},
      preferences: {},
    }).success).toBe(false)
  })
})
