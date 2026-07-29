"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type PronunciationStatus = "idle" | "loading" | "ready" | "error"

interface PronunciationResult {
  status: PronunciationStatus
  src: string | null
  error: string | null
}

const CACHE_KEY_PREFIX = "vocablab_pron_"
const CACHE_VERSION = 3
const CACHE_NAME = `vocablab-pronunciation-v${CACHE_VERSION}`

function purgeLegacyLocalStorage() {
  if (typeof window === "undefined") return
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(CACHE_KEY_PREFIX) && !key.endsWith(`migrated_v${CACHE_VERSION}`)) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}

function ensureCacheMigration() {
  if (typeof window === "undefined") return
  const migrationFlag = `${CACHE_KEY_PREFIX}migrated_v${CACHE_VERSION}`
  if (localStorage.getItem(migrationFlag)) return
  purgeLegacyLocalStorage()
  localStorage.setItem(migrationFlag, "1")
}

function cacheRequest(word: string, voice: string) {
  return new Request(
    `${window.location.origin}/__vocablab_audio_cache__/${encodeURIComponent(voice)}/${encodeURIComponent(word)}`,
  )
}

async function readCache(word: string, voice: string): Promise<string | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null
  try {
    ensureCacheMigration()
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(cacheRequest(word, voice))
    return response ? await response.text() : null
  } catch {
    return null
  }
}

async function writeCache(word: string, src: string, voice: string) {
  if (typeof window === "undefined" || !("caches" in window)) return
  try {
    ensureCacheMigration()
    const cache = await caches.open(CACHE_NAME)
    await cache.put(
      cacheRequest(word, voice),
      new Response(src, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      }),
    )
  } catch {
    // Audio still plays for this session when persistent browser cache is unavailable.
  }
}

async function deleteCachedAudio(word: string, voice: string) {
  if (typeof window === "undefined" || !("caches" in window)) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.delete(cacheRequest(word, voice))
  } catch {
    // A failed cache deletion must not prevent on-demand regeneration.
  }
}

function inferMimeType(format: string): string {
  const f = format.toLowerCase()
  if (f.includes("wav")) return "audio/wav"
  if (f.includes("mp3") || f.includes("mpeg")) return "audio/mpeg"
  if (f.includes("ogg") || f.includes("opus")) return "audio/ogg"
  if (f.includes("webm")) return "audio/webm"
  return "audio/wav"
}

function buildAudioSrc(formatOrMime: string, data: string): string {
  const isMime = formatOrMime.startsWith("audio/")
  const mime = isMime ? formatOrMime : inferMimeType(formatOrMime)
  return `data:${mime};base64,${data}`
}

export interface PronunciationOptions {
  voice?: string
}

export function usePronunciation() {
  const [results, setResults] = useState<Record<string, PronunciationResult>>({})
  const inflightRef = useRef<Map<string, Promise<string | null>>>(new Map())

  const ensurePronunciation = useCallback(async (word: string, options?: PronunciationOptions): Promise<string | null> => {
    const normalized = word.trim().toLowerCase()
    const voice = options?.voice ?? "alloy"
    if (!normalized) return null

    const resultKey = `${voice}__${normalized}`

    const cached = await readCache(normalized, voice)
    if (cached) {
      setResults((prev) => ({ ...prev, [resultKey]: { status: "ready", src: cached, error: null } }))
      return cached
    }

    const existing = inflightRef.current.get(resultKey)
    if (existing) return existing

    const promise = (async (): Promise<string | null> => {
      setResults((prev) => ({ ...prev, [resultKey]: { status: "loading", src: null, error: null } }))

      try {
        const res = await fetch("/api/ai/pronounce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: normalized, voice }),
        })

        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json?.error || `Falha ao gerar pronúncia (${res.status})`)
        }

        const data = (await res.json()) as { data?: string; format?: string; mimeType?: string; url?: string }

        let src: string | null = null
        if (data.data) {
          src = buildAudioSrc(data.mimeType ?? data.format ?? "mp3", data.data)
        } else if (data.url) {
          src = data.url
        }

        if (!src) throw new Error("Resposta de áudio vazia")

        await writeCache(normalized, src, voice)
        setResults((prev) => ({ ...prev, [resultKey]: { status: "ready", src, error: null } }))
        return src
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao gerar pronúncia"
        setResults((prev) => ({ ...prev, [resultKey]: { status: "error", src: null, error: message } }))
        return null
      } finally {
        inflightRef.current.delete(resultKey)
      }
    })()

    inflightRef.current.set(resultKey, promise)
    return promise
  }, [])

  const getCachedSrc = useCallback((word: string, voice?: string): Promise<string | null> => {
    return readCache(word.trim().toLowerCase(), voice ?? "alloy")
  }, [])

  const hasCachedPronunciation = useCallback(async (word: string, voice?: string): Promise<boolean> => {
    return await readCache(word.trim().toLowerCase(), voice ?? "alloy") !== null
  }, [])

  const regeneratePronunciation = useCallback(async (word: string, options?: PronunciationOptions): Promise<string | null> => {
    const normalized = word.trim().toLowerCase()
    const voice = options?.voice ?? "alloy"
    if (!normalized) return null
    const resultKey = `${voice}__${normalized}`
    await deleteCachedAudio(normalized, voice)
    setResults((prev) => {
      const next = { ...prev }
      delete next[resultKey]
      return next
    })
    inflightRef.current.delete(resultKey)
    return await ensurePronunciation(normalized, { voice })
  }, [ensurePronunciation])

  const resultFor = useCallback((word: string, voice?: string): PronunciationResult => {
    const normalized = word.trim().toLowerCase()
    const voiceKey = voice ?? "alloy"
    const resultKey = `${voiceKey}__${normalized}`
    return results[resultKey] ?? { status: "idle", src: null, error: null }
  }, [results])

  useEffect(() => {
    return () => {
      inflightRef.current.clear()
    }
  }, [])

  return {
    ensurePronunciation,
    getCachedSrc,
    hasCachedPronunciation,
    regeneratePronunciation,
    resultFor,
  }
}
