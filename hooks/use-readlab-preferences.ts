"use client"

import { useCallback, useEffect, useState } from "react"
import { PRONUNCIATION_VOICES, type PronunciationVoice } from "@/hooks/use-ai-preferences"

const VOICE_KEY = "readlab_audio_voice"
const REGENERATE_KEY = "readlab_show_regenerate_audio_button"
export const READLAB_PREFERENCES_UPDATED_EVENT = "readlab-preferences-updated"

function isVoice(value: string): value is PronunciationVoice {
  return (PRONUNCIATION_VOICES as readonly string[]).includes(value)
}

export function useReadLabPreferences() {
  const [audioVoice, setAudioVoiceState] = useState<PronunciationVoice>("alloy")
  const [showRegenerateAudioButton, setShowRegenerateAudioButtonState] = useState(false)

  const load = useCallback(() => {
    const voice = localStorage.getItem(VOICE_KEY)
    if (voice && isVoice(voice)) setAudioVoiceState(voice)
    const regenerate = localStorage.getItem(REGENERATE_KEY)
    if (regenerate !== null) setShowRegenerateAudioButtonState(regenerate === "true")
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(READLAB_PREFERENCES_UPDATED_EVENT, load)
    return () => window.removeEventListener(READLAB_PREFERENCES_UPDATED_EVENT, load)
  }, [load])

  const notify = () => window.dispatchEvent(new Event(READLAB_PREFERENCES_UPDATED_EVENT))

  const setAudioVoice = useCallback((voice: PronunciationVoice) => {
    setAudioVoiceState(voice)
    localStorage.setItem(VOICE_KEY, voice)
    notify()
  }, [])

  const setShowRegenerateAudioButton = useCallback((value: boolean) => {
    setShowRegenerateAudioButtonState(value)
    localStorage.setItem(REGENERATE_KEY, String(value))
    notify()
  }, [])

  return { audioVoice, setAudioVoice, showRegenerateAudioButton, setShowRegenerateAudioButton }
}
