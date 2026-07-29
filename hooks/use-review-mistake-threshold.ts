"use client"

import { useCallback, useEffect, useState } from "react"
import {
  DEFAULT_REVIEW_MISTAKE_THRESHOLD,
  normalizeReviewMistakeThreshold,
  REVIEW_MISTAKE_THRESHOLD_STORAGE_KEY,
} from "@/lib/study-preferences"
import { REVIEW_MISTAKE_THRESHOLD_UPDATED_EVENT } from "@/lib/constants"

export function useReviewMistakeThreshold() {
  const [threshold, setThresholdState] = useState(
    DEFAULT_REVIEW_MISTAKE_THRESHOLD,
  )

  useEffect(() => {
    const readStoredValue = () => {
      setThresholdState(
        normalizeReviewMistakeThreshold(
          localStorage.getItem(REVIEW_MISTAKE_THRESHOLD_STORAGE_KEY),
        ),
      )
    }

    readStoredValue()
    window.addEventListener(
      REVIEW_MISTAKE_THRESHOLD_UPDATED_EVENT,
      readStoredValue,
    )
    window.addEventListener("vocablab-synced-preferences", readStoredValue)
    window.addEventListener("storage", readStoredValue)
    return () => {
      window.removeEventListener(
        REVIEW_MISTAKE_THRESHOLD_UPDATED_EVENT,
        readStoredValue,
      )
      window.removeEventListener("vocablab-synced-preferences", readStoredValue)
      window.removeEventListener("storage", readStoredValue)
    }
  }, [])

  const setThreshold = useCallback((value: number) => {
    const normalized = normalizeReviewMistakeThreshold(value)
    localStorage.setItem(
      REVIEW_MISTAKE_THRESHOLD_STORAGE_KEY,
      String(normalized),
    )
    setThresholdState(normalized)
    window.dispatchEvent(new Event(REVIEW_MISTAKE_THRESHOLD_UPDATED_EVENT))
  }, [])

  return { threshold, setThreshold }
}
