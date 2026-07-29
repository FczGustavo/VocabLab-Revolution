"use client"

import { useCallback, useEffect, useState } from "react"
import { REGENCYLAB_PREFERENCES_UPDATED_EVENT } from "@/lib/constants"

const keys = {
  showCategory: "regencylab_show_category",
  showGrammaticalForm: "regencylab_show_grammatical_form",
  showMeaning: "regencylab_show_meaning",
  showContrast: "regencylab_show_contrast",
  showExample: "regencylab_show_example",
  showTranslation: "regencylab_show_translation",
} as const

export interface RegencyDisplayPreferences {
  showCategory: boolean
  showGrammaticalForm: boolean
  showMeaning: boolean
  showContrast: boolean
  showExample: boolean
  showTranslation: boolean
}

const defaults: RegencyDisplayPreferences = {
  showCategory: true,
  showGrammaticalForm: true,
  showMeaning: true,
  showContrast: false,
  showExample: true,
  showTranslation: true,
}

export function useRegencyPreferences() {
  const [preferences, setPreferences] = useState(defaults)

  const load = useCallback(() => {
    setPreferences(Object.fromEntries(Object.entries(keys).map(([name, key]) => {
      const saved = localStorage.getItem(key)
      return [name, saved === null ? defaults[name as keyof RegencyDisplayPreferences] : saved === "true"]
    })) as unknown as RegencyDisplayPreferences)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(REGENCYLAB_PREFERENCES_UPDATED_EVENT, load)
    return () => window.removeEventListener(REGENCYLAB_PREFERENCES_UPDATED_EVENT, load)
  }, [load])

  const setPreference = useCallback((name: keyof RegencyDisplayPreferences, value: boolean) => {
    localStorage.setItem(keys[name], String(value))
    setPreferences((current) => ({ ...current, [name]: value }))
    window.dispatchEvent(new Event(REGENCYLAB_PREFERENCES_UPDATED_EVENT))
  }, [])

  return {
    ...preferences,
    setShowCategory: (value: boolean) => setPreference("showCategory", value),
    setShowGrammaticalForm: (value: boolean) => setPreference("showGrammaticalForm", value),
    setShowMeaning: (value: boolean) => setPreference("showMeaning", value),
    setShowContrast: (value: boolean) => setPreference("showContrast", value),
    setShowExample: (value: boolean) => setPreference("showExample", value),
    setShowTranslation: (value: boolean) => setPreference("showTranslation", value),
  }
}
