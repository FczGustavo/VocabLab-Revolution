"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "vocablab_study_header_collapsed"

export function useStudyHeaderPreference() {
  const [startCollapsed, setStartCollapsedState] = useState(false)

  useEffect(() => {
    setStartCollapsedState(localStorage.getItem(STORAGE_KEY) === "true")
  }, [])

  const setStartCollapsed = useCallback((value: boolean) => {
    setStartCollapsedState(value)
    localStorage.setItem(STORAGE_KEY, String(value))
  }, [])

  return { startCollapsed, setStartCollapsed }
}
