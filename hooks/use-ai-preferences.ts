"use client"

import { useCallback, useEffect, useState } from "react"
import { AI_PREFERENCES_UPDATED_EVENT } from "@/lib/constants"

const INCLUDE_SYNONYMS_ANTONYMS_KEY = "vocablab_include_synonyms_antonyms"
const SYNONYMS_DISPLAY_COUNT_KEY = "vocablab_synonyms_display_count"
const INCLUDE_CONJUGATIONS_KEY = "vocablab_include_conjugations"
const INCLUDE_ALTERNATIVE_FORMS_KEY = "vocablab_include_alternative_forms"
const INCLUDE_USAGE_NOTE_KEY = "vocablab_include_usage_note"
const EFOMM_MODE_KEY = "vocablab_efomm_mode"
const INCLUDE_MULTIPLE_TRANSLATIONS_KEY = "vocablab_include_multiple_translations"
const SHOW_CONTEXT_KEY = "vocablab_show_context"
const CONTEXT_IN_PORTUGUESE_KEY = "vocablab_context_in_portuguese"
const SHOW_IPA_KEY = "vocablab_show_ipa"
const SHOW_GRAMMATICAL_FORM_KEY = "vocablab_show_grammatical_form"
const SHOW_MANUAL_OPTIONAL_FIELDS_KEY = "vocablab_show_manual_optional_fields"
const SHOW_REGENERATE_AUDIO_BUTTON_KEY = "vocablab_show_regenerate_audio_button"
const USE_AI_PREDICTIONS_KEY = "vocablab_use_ai_predictions"
const PRONUNCIATION_VOICE_KEY = "vocablab_pronunciation_voice"

export const PRONUNCIATION_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const
export type PronunciationVoice = (typeof PRONUNCIATION_VOICES)[number]
const DEFAULT_PRONUNCIATION_VOICE: PronunciationVoice = "alloy"

function isPronunciationVoice(value: string): value is PronunciationVoice {
  return (PRONUNCIATION_VOICES as readonly string[]).includes(value)
}

export type SynonymsLevel = 0 | 1 | 2 | 3

function clampSynonymsLevel(value: number): SynonymsLevel {
  if (value <= 0) return 0
  if (value === 1) return 1
  if (value === 2) return 2
  return 3
}

function clampSynonymsDisplayCount(value: number): SynonymsLevel {
  return clampSynonymsLevel(value)
}

function notifyAiPreferencesUpdated() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(AI_PREFERENCES_UPDATED_EVENT))
}

export function useAiPreferences() {
  const [includeSynonymsAntonyms, setIncludeSynonymsAntonymsState] = useState(true)
  const [synonymsDisplayCount, setSynonymsDisplayCountState] = useState<SynonymsLevel>(0)
  const [includeConjugations, setIncludeConjugationsState] = useState(true)
  const [includeAlternativeForms, setIncludeAlternativeFormsState] = useState(false)
  const [includeUsageNote, setIncludeUsageNoteState] = useState(true)
  const [showContext, setShowContextState] = useState(true)
  const [contextInPortuguese, setContextInPortugueseState] = useState(true)
  const [showIPA, setShowIPAState] = useState(false)
  const [showGrammaticalForm, setShowGrammaticalFormState] = useState(true)
  const [efommMode, setEfommModeState] = useState(true)
  const [includeMultipleTranslations, setIncludeMultipleTranslationsState] = useState(true)
  const [showManualOptionalFields, setShowManualOptionalFieldsState] = useState(false)
  const [showRegenerateAudioButton, setShowRegenerateAudioButtonState] = useState(false)
  const [useAiPredictions, setUseAiPredictionsState] = useState(true)
  const [pronunciationVoice, setPronunciationVoiceState] = useState<PronunciationVoice>(DEFAULT_PRONUNCIATION_VOICE)
  const [isLoaded, setIsLoaded] = useState(false)

  const loadPreferences = useCallback(() => {
    const savedIncludeSynAnt = localStorage.getItem(INCLUDE_SYNONYMS_ANTONYMS_KEY)
    if (savedIncludeSynAnt !== null) {
      setIncludeSynonymsAntonymsState(savedIncludeSynAnt === "true")
    }

    const savedDisplayCount = localStorage.getItem(SYNONYMS_DISPLAY_COUNT_KEY)
    if (savedDisplayCount !== null) {
      const parsed = Number(savedDisplayCount)
      if (!Number.isNaN(parsed)) {
        setSynonymsDisplayCountState(clampSynonymsDisplayCount(parsed))
      }
    }

    const savedConjugations = localStorage.getItem(INCLUDE_CONJUGATIONS_KEY)
    if (savedConjugations !== null) {
      setIncludeConjugationsState(savedConjugations === "true")
    }

    const savedAlternativeForms = localStorage.getItem(INCLUDE_ALTERNATIVE_FORMS_KEY)
    if (savedAlternativeForms !== null) {
      setIncludeAlternativeFormsState(savedAlternativeForms === "true")
    }

    const savedUsageNote = localStorage.getItem(INCLUDE_USAGE_NOTE_KEY)
    if (savedUsageNote !== null) {
      setIncludeUsageNoteState(savedUsageNote === "true")
    }

    const savedContextDetailMode = localStorage.getItem("vocablab_context_detail_mode")
    if (savedContextDetailMode === "smart" || savedContextDetailMode === "always") {
      setShowContextState(savedContextDetailMode === "always")
    }

    const savedShowContext = localStorage.getItem(SHOW_CONTEXT_KEY)
    if (savedShowContext !== null) {
      setShowContextState(savedShowContext === "true")
    }

    const savedContextInPortuguese = localStorage.getItem(CONTEXT_IN_PORTUGUESE_KEY)
    if (savedContextInPortuguese !== null) {
      setContextInPortugueseState(savedContextInPortuguese === "true")
    }

    const savedShowIPA = localStorage.getItem(SHOW_IPA_KEY)
    if (savedShowIPA !== null) {
      setShowIPAState(savedShowIPA === "true")
    }
    const savedShowGrammaticalForm = localStorage.getItem(SHOW_GRAMMATICAL_FORM_KEY)
    if (savedShowGrammaticalForm !== null) setShowGrammaticalFormState(savedShowGrammaticalForm === "true")

    const savedEfomm = localStorage.getItem(EFOMM_MODE_KEY)
    if (savedEfomm !== null) {
      setEfommModeState(savedEfomm === "true")
    }

    const savedMultipleTranslations = localStorage.getItem(INCLUDE_MULTIPLE_TRANSLATIONS_KEY)
    if (savedMultipleTranslations !== null) {
      setIncludeMultipleTranslationsState(savedMultipleTranslations === "true")
    }

    const savedShowManualOptionalFields = localStorage.getItem(SHOW_MANUAL_OPTIONAL_FIELDS_KEY)
    if (savedShowManualOptionalFields !== null) {
      setShowManualOptionalFieldsState(savedShowManualOptionalFields === "true")
    }

    const savedShowRegenerateAudio = localStorage.getItem(SHOW_REGENERATE_AUDIO_BUTTON_KEY)
    if (savedShowRegenerateAudio !== null) {
      setShowRegenerateAudioButtonState(savedShowRegenerateAudio === "true")
    }

    const savedAiPred = localStorage.getItem(USE_AI_PREDICTIONS_KEY)
    if (savedAiPred !== null) {
      setUseAiPredictionsState(savedAiPred === "true")
    }

    const savedVoice = localStorage.getItem(PRONUNCIATION_VOICE_KEY)
    if (savedVoice && isPronunciationVoice(savedVoice)) {
      setPronunciationVoiceState(savedVoice)
    }

    setIsLoaded(true)
  }, [])

  useEffect(() => {
    loadPreferences()

    const onPrefsUpdated = () => loadPreferences()
    window.addEventListener(AI_PREFERENCES_UPDATED_EVENT, onPrefsUpdated)

    return () => {
      window.removeEventListener(AI_PREFERENCES_UPDATED_EVENT, onPrefsUpdated)
    }
  }, [loadPreferences])

  const setIncludeSynonymsAntonyms = useCallback((value: boolean) => {
    setIncludeSynonymsAntonymsState(value)
    localStorage.setItem(INCLUDE_SYNONYMS_ANTONYMS_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setSynonymsDisplayCount = useCallback((count: number) => {
    const clamped = Math.max(0, Math.min(3, Math.floor(count))) as SynonymsLevel
    setSynonymsDisplayCountState(clamped)
    localStorage.setItem(SYNONYMS_DISPLAY_COUNT_KEY, String(clamped))
    notifyAiPreferencesUpdated()
  }, [])

  const setIncludeConjugations = useCallback((value: boolean) => {
    setIncludeConjugationsState(value)
    localStorage.setItem(INCLUDE_CONJUGATIONS_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setIncludeAlternativeForms = useCallback((value: boolean) => {
    setIncludeAlternativeFormsState(value)
    localStorage.setItem(INCLUDE_ALTERNATIVE_FORMS_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setIncludeUsageNote = useCallback((value: boolean) => {
    setIncludeUsageNoteState(value)
    localStorage.setItem(INCLUDE_USAGE_NOTE_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setShowContext = useCallback((value: boolean) => {
    setShowContextState(value)
    localStorage.setItem(SHOW_CONTEXT_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setContextInPortuguese = useCallback((value: boolean) => {
    setContextInPortugueseState(value)
    localStorage.setItem(CONTEXT_IN_PORTUGUESE_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setShowIPA = useCallback((value: boolean) => {
    setShowIPAState(value)
    localStorage.setItem(SHOW_IPA_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])
  const setShowGrammaticalForm = useCallback((value: boolean) => {
    setShowGrammaticalFormState(value)
    localStorage.setItem(SHOW_GRAMMATICAL_FORM_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setEfommMode = useCallback((value: boolean) => {
    setEfommModeState(value)
    localStorage.setItem(EFOMM_MODE_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setIncludeMultipleTranslations = useCallback((value: boolean) => {
    setIncludeMultipleTranslationsState(value)
    localStorage.setItem(INCLUDE_MULTIPLE_TRANSLATIONS_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setShowManualOptionalFields = useCallback((value: boolean) => {
    setShowManualOptionalFieldsState(value)
    localStorage.setItem(SHOW_MANUAL_OPTIONAL_FIELDS_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setShowRegenerateAudioButton = useCallback((value: boolean) => {
    setShowRegenerateAudioButtonState(value)
    localStorage.setItem(SHOW_REGENERATE_AUDIO_BUTTON_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setUseAiPredictions = useCallback((value: boolean) => {
    setUseAiPredictionsState(value)
    localStorage.setItem(USE_AI_PREDICTIONS_KEY, String(value))
    notifyAiPreferencesUpdated()
  }, [])

  const setPronunciationVoice = useCallback((voice: PronunciationVoice) => {
    setPronunciationVoiceState(voice)
    localStorage.setItem(PRONUNCIATION_VOICE_KEY, voice)
    notifyAiPreferencesUpdated()
  }, [])

  return {
    includeSynonymsAntonyms,
    setIncludeSynonymsAntonyms,
    synonymsDisplayCount,
    setSynonymsDisplayCount,
    includeConjugations,
    setIncludeConjugations,
    includeAlternativeForms,
    setIncludeAlternativeForms,
    includeUsageNote,
    setIncludeUsageNote,
    showContext,
    setShowContext,
    contextInPortuguese,
    setContextInPortuguese,
    showIPA,
    setShowIPA,
    showGrammaticalForm,
    setShowGrammaticalForm,
    efommMode,
    setEfommMode,
    includeMultipleTranslations,
    setIncludeMultipleTranslations,
    showManualOptionalFields,
    setShowManualOptionalFields,
    showRegenerateAudioButton,
    setShowRegenerateAudioButton,
    useAiPredictions,
    setUseAiPredictions,
    pronunciationVoice,
    setPronunciationVoice,
    isLoaded,
  }
}
