import { describe, expect, it } from "vitest"
import {
  DEFAULT_REVIEW_MISTAKE_THRESHOLD,
  isReviewMistakeThresholdReached,
  normalizeReviewMistakeThreshold,
} from "@/lib/study-preferences"

describe("normalizeReviewMistakeThreshold", () => {
  it("keeps two mistakes as the default", () => {
    expect(normalizeReviewMistakeThreshold(null)).toBe(
      DEFAULT_REVIEW_MISTAKE_THRESHOLD,
    )
    expect(normalizeReviewMistakeThreshold("")).toBe(
      DEFAULT_REVIEW_MISTAKE_THRESHOLD,
    )
  })

  it("accepts whole values inside the supported range", () => {
    expect(normalizeReviewMistakeThreshold("1")).toBe(1)
    expect(normalizeReviewMistakeThreshold(6)).toBe(6)
    expect(normalizeReviewMistakeThreshold("10")).toBe(10)
  })

  it("truncates and clamps invalid ranges", () => {
    expect(normalizeReviewMistakeThreshold(4.9)).toBe(4)
    expect(normalizeReviewMistakeThreshold(-3)).toBe(0)
    expect(normalizeReviewMistakeThreshold(99)).toBe(10)
    expect(normalizeReviewMistakeThreshold("not-a-number")).toBe(
      DEFAULT_REVIEW_MISTAKE_THRESHOLD,
    )
  })

  it("uses the same automatic Review rule for every study mode", () => {
    expect(isReviewMistakeThresholdReached(1, 2)).toBe(false)
    expect(isReviewMistakeThresholdReached(2, 2)).toBe(true)
    expect(isReviewMistakeThresholdReached(4, 1)).toBe(true)
    expect(isReviewMistakeThresholdReached(10, 0)).toBe(false)
  })
})
