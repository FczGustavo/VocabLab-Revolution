export const REVIEW_MISTAKE_THRESHOLD_STORAGE_KEY =
  "vocablab_study_review_mistake_threshold"

export const DEFAULT_REVIEW_MISTAKE_THRESHOLD = 2
export const MIN_REVIEW_MISTAKE_THRESHOLD = 0
export const MAX_REVIEW_MISTAKE_THRESHOLD = 10

export function normalizeReviewMistakeThreshold(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(parsed)) return DEFAULT_REVIEW_MISTAKE_THRESHOLD

  return Math.min(
    MAX_REVIEW_MISTAKE_THRESHOLD,
    Math.max(MIN_REVIEW_MISTAKE_THRESHOLD, Math.trunc(parsed)),
  )
}

/**
 * Keeps the Review rule identical across every study surface and Lab.
 * A threshold of zero explicitly disables automatic Review.
 */
export function isReviewMistakeThresholdReached(
  mistakeCount: number,
  threshold: number,
) {
  const normalizedMistakes = Number.isFinite(mistakeCount)
    ? Math.max(0, Math.trunc(mistakeCount))
    : 0
  const normalizedThreshold = normalizeReviewMistakeThreshold(threshold)
  return normalizedThreshold > 0 && normalizedMistakes >= normalizedThreshold
}
