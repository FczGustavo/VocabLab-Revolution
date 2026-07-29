"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "vocablab_study_shortcut_coach_enabled"

export function useStudyShortcutCoach() {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) setEnabledState(saved === "true")
  }, [])

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    localStorage.setItem(STORAGE_KEY, String(value))
  }, [])

  return { enabled, setEnabled }
}
