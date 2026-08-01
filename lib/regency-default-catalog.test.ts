import { describe, expect, it } from "vitest"
import {
  REGENCY_DEFAULT_CATALOG,
  regencyCatalogContentHash,
  regencyCatalogLegacyContentHash,
  validateRegencyDefaultCatalog,
} from "./regency-default-catalog"

describe("Regency starter catalog", () => {
  it("assigns a grammatical form to every curated card", () => {
    expect(() => validateRegencyDefaultCatalog()).not.toThrow()
    expect(REGENCY_DEFAULT_CATALOG.every((entry) => Boolean(entry.grammaticalForm))).toBe(true)

    const participles = REGENCY_DEFAULT_CATALOG
      .filter((entry) => entry.grammaticalForm === "past-participle")
      .map((entry) => entry.term)
    expect([...new Set(participles)].sort()).toEqual(["accustomed", "derived", "known", "married"])
    expect(REGENCY_DEFAULT_CATALOG
      .filter((entry) => !participles.includes(entry.term))
      .every((entry) => entry.grammaticalForm === "base-form")).toBe(true)
  })

  it("uses a new hash while retaining the legacy hash for safe migration", () => {
    const entry = REGENCY_DEFAULT_CATALOG[0]
    expect(regencyCatalogContentHash(entry)).not.toBe(regencyCatalogLegacyContentHash(entry))
  })
})
