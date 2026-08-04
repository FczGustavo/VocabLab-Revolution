"use client"

import { useCallback, useEffect, useState } from "react"

export const SHOW_VOCAB_ESSENTIALS_KEY = "vocablab_show_essentials_folders"
export const VOCAB_HOME_PREFERENCES_UPDATED_EVENT = "vocablab-home-preferences-updated"

export function useVocabHomePreferences() {
  const [showEssentialsFolders, setShowEssentialsFoldersState] = useState(true)

  const loadPreference = useCallback(() => {
    const stored = localStorage.getItem(SHOW_VOCAB_ESSENTIALS_KEY)
    setShowEssentialsFoldersState(stored === null ? true : stored === "true")
  }, [])

  useEffect(() => {
    loadPreference()
    window.addEventListener(VOCAB_HOME_PREFERENCES_UPDATED_EVENT, loadPreference)
    window.addEventListener("vocablab-synced-preferences", loadPreference)
    return () => {
      window.removeEventListener(VOCAB_HOME_PREFERENCES_UPDATED_EVENT, loadPreference)
      window.removeEventListener("vocablab-synced-preferences", loadPreference)
    }
  }, [loadPreference])

  const setShowEssentialsFolders = useCallback((value: boolean) => {
    setShowEssentialsFoldersState(value)
    localStorage.setItem(SHOW_VOCAB_ESSENTIALS_KEY, String(value))
    window.dispatchEvent(new Event(VOCAB_HOME_PREFERENCES_UPDATED_EVENT))
  }, [])

  return { showEssentialsFolders, setShowEssentialsFolders }
}
