import { beforeEach, describe, expect, it } from "vitest"
import {
  getOrCreateSyncOwnerToken,
  getSyncOwnerToken,
} from "./sync-identity-client"

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  get length() {
    return this.values.size
  }
}

describe("sync owner tokens", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    })
  })

  it("generates a 256-bit token and reuses it for the same identity", () => {
    const first = getOrCreateSyncOwnerToken("alpha-1234")
    const second = getOrCreateSyncOwnerToken("alpha-1234")

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toBe(first)
    expect(getSyncOwnerToken("alpha-1234")).toBe(first)
  })

  it("keeps different identities isolated", () => {
    const first = getOrCreateSyncOwnerToken("alpha-1234")
    const second = getOrCreateSyncOwnerToken("bravo-1234")

    expect(first).not.toBe(second)
  })
})
