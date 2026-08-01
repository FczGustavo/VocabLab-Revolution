"use client"

import { useEffect, useMemo, useState } from "react"
import { SYNC_IDENTITY_UPDATED_EVENT } from "@/lib/auto-sync-client"
import { getSyncOwnerToken } from "@/lib/sync-identity-client"
import { normalizeSyncWord } from "@/lib/sync-schema"

const LEGACY_SYNC_CODE_KEY = "vocablab_sync_code"
const SYNC_WORD_KEY = "vocablab_sync_word"
const SYNC_PIN_KEY = "vocablab_sync_pin"
const SYNC_REVISIONS_KEY = "vocablab_sync_revisions"
const SYNC_IDENTITY_LOCKED_KEY = "vocablab_sync_identity_locked"
const SYNC_ENABLED_KEY = "vocablab_sync_enabled"

function generatePin() {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return String(values[0] % 10_000).padStart(4, "0")
}

function readRevisions() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_REVISIONS_KEY) ?? "{}") as Record<string, number>
  } catch {
    return {}
  }
}

export function useSyncCode() {
  const [syncWord, setSyncWordState] = useState("")
  const [syncPin, setSyncPinState] = useState("")
  const [revision, setRevisionState] = useState(0)
  const [isIdentityLocked, setIsIdentityLockedState] = useState(false)
  const [isSyncEnabled, setIsSyncEnabledState] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const legacy = localStorage.getItem(LEGACY_SYNC_CODE_KEY) ?? ""
    const legacyMatch = /^([a-z0-9]{2,24})-(\d{4})$/i.exec(legacy.trim())
    const savedWord = localStorage.getItem(SYNC_WORD_KEY)
    const savedPin = localStorage.getItem(SYNC_PIN_KEY)
    const word = normalizeSyncWord(savedWord ?? legacyMatch?.[1] ?? "")
    const pin = /^\d{4}$/.test(savedPin ?? "")
      ? savedPin!
      : legacyMatch?.[2] ?? generatePin()

    const initialCode = word ? `${word}-${pin}` : ""
    const canRemainLocked = Boolean(
      initialCode
      && getSyncOwnerToken(initialCode)
      && localStorage.getItem(SYNC_IDENTITY_LOCKED_KEY) === "true",
    )
    setSyncWordState(word)
    setSyncPinState(pin)
    setIsIdentityLockedState(canRemainLocked)
    setIsSyncEnabledState(localStorage.getItem(SYNC_ENABLED_KEY) !== "false")
    setRevisionState(initialCode ? readRevisions()[initialCode] ?? 0 : 0)
    localStorage.setItem(SYNC_WORD_KEY, word)
    localStorage.setItem(SYNC_PIN_KEY, pin)
    localStorage.setItem(SYNC_IDENTITY_LOCKED_KEY, String(canRemainLocked))
    // Remove only legacy values that already match the new shape. Arbitrary
    // codes from older releases are preserved so a future/manual migration
    // cannot silently lose the user's only reference to an existing backup.
    if (legacyMatch) localStorage.removeItem(LEGACY_SYNC_CODE_KEY)
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    const reload = () => {
      const word = normalizeSyncWord(localStorage.getItem(SYNC_WORD_KEY) ?? "")
      const pin = localStorage.getItem(SYNC_PIN_KEY) ?? ""
      const code = word && /^\d{4}$/.test(pin) ? `${word}-${pin}` : ""
      setSyncWordState(word)
      setSyncPinState(/^\d{4}$/.test(pin) ? pin : "")
      setIsIdentityLockedState(Boolean(
        code
        && getSyncOwnerToken(code)
        && localStorage.getItem(SYNC_IDENTITY_LOCKED_KEY) === "true",
      ))
      setIsSyncEnabledState(localStorage.getItem(SYNC_ENABLED_KEY) !== "false")
    }
    window.addEventListener(SYNC_IDENTITY_UPDATED_EVENT, reload)
    return () => window.removeEventListener(SYNC_IDENTITY_UPDATED_EVENT, reload)
  }, [])

  const syncCode = useMemo(
    () => syncWord && syncPin ? `${syncWord}-${syncPin}` : "",
    [syncPin, syncWord],
  )

  const setSyncWord = (value: string) => {
    if (isIdentityLocked) return
    const normalized = normalizeSyncWord(value)
    setSyncWordState(normalized)
    localStorage.setItem(SYNC_WORD_KEY, normalized)
    const nextCode = normalized && syncPin ? `${normalized}-${syncPin}` : ""
    setRevisionState(nextCode ? readRevisions()[nextCode] ?? 0 : 0)
    window.dispatchEvent(new Event(SYNC_IDENTITY_UPDATED_EVENT))
  }

  const setSyncPin = (value: string) => {
    if (isIdentityLocked) return
    const normalized = value.replace(/\D/g, "").slice(0, 4)
    setSyncPinState(normalized)
    localStorage.setItem(SYNC_PIN_KEY, normalized)
    const nextCode = syncWord && normalized.length === 4 ? `${syncWord}-${normalized}` : ""
    setRevisionState(nextCode ? readRevisions()[nextCode] ?? 0 : 0)
    window.dispatchEvent(new Event(SYNC_IDENTITY_UPDATED_EVENT))
  }

  const setRevision = (nextRevision: number) => {
    if (!syncCode || !Number.isInteger(nextRevision) || nextRevision < 0) return
    const revisions = readRevisions()
    revisions[syncCode] = nextRevision
    localStorage.setItem(SYNC_REVISIONS_KEY, JSON.stringify(revisions))
    setRevisionState(nextRevision)
  }

  const isValid = useMemo(
    () => /^[a-z0-9]{2,24}-\d{4}$/.test(syncCode),
    [syncCode],
  )

  const setIdentityLocked = (locked: boolean) => {
    if (locked && (!isValid || !getSyncOwnerToken(syncCode))) return false
    localStorage.setItem(SYNC_IDENTITY_LOCKED_KEY, String(locked))
    setIsIdentityLockedState(locked)
    window.dispatchEvent(new Event(SYNC_IDENTITY_UPDATED_EVENT))
    return true
  }

  const setSyncEnabled = (enabled: boolean) => {
    localStorage.setItem(SYNC_ENABLED_KEY, String(enabled))
    setIsSyncEnabledState(enabled)
    window.dispatchEvent(new Event(SYNC_IDENTITY_UPDATED_EVENT))
  }

  const activateIdentity = (wordValue: string, pinValue: string) => {
    const word = normalizeSyncWord(wordValue)
    const pin = pinValue.replace(/\D/g, "").slice(0, 4)
    const code = word && /^\d{4}$/.test(pin) ? `${word}-${pin}` : ""
    if (!code || !getSyncOwnerToken(code)) return false

    localStorage.setItem(SYNC_WORD_KEY, word)
    localStorage.setItem(SYNC_PIN_KEY, pin)
    localStorage.setItem(SYNC_IDENTITY_LOCKED_KEY, "true")
    setSyncWordState(word)
    setSyncPinState(pin)
    setRevisionState(readRevisions()[code] ?? 0)
    setIsIdentityLockedState(true)
    window.dispatchEvent(new Event(SYNC_IDENTITY_UPDATED_EVENT))
    return true
  }

  return {
    syncWord,
    syncPin,
    syncCode,
    revision,
    setSyncWord,
    setSyncPin,
    setRevision,
    isValid,
    isIdentityLocked,
    setIdentityLocked,
    isSyncEnabled,
    setSyncEnabled,
    activateIdentity,
    isLoaded,
  }
}
