import { describe, expect, it } from "vitest"
import { reviewFolderTitle } from "@/lib/review-folder-title"

const curated = [
  "Regency Essentials",
  "Phrasal Verbs Essentials",
  "Idioms Essentials",
]

describe("reviewFolderTitle", () => {
  it("uses only the first name for curated folders", () => {
    expect(reviewFolderTitle("Regency Essentials", curated)).toBe(
      'Review of "Regency"',
    )
    expect(reviewFolderTitle("Phrasal Verbs Essentials", curated)).toBe(
      'Review of "Phrasal"',
    )
    expect(reviewFolderTitle("Idioms Essentials", curated)).toBe(
      'Review of "Idioms"',
    )
  })

  it("preserves the complete name of personal folders", () => {
    expect(reviewFolderTitle("Maritime English", curated)).toBe(
      'Review of "Maritime English"',
    )
  })
})
