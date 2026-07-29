"use client"

import { useCallback, useRef, useState } from "react"

type AudioStatus = "idle" | "loading" | "ready" | "error"
const CACHE_PREFIX = "readlab_audio_v1_"
const CACHE_NAME = "readlab-audio-v2"

function key(text: string, voice: string) {
  return `${CACHE_PREFIX}${voice}__${text.trim().toLowerCase()}`
}

function purgeLegacyCache() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const storedKey = localStorage.key(index)
      if (storedKey?.startsWith(CACHE_PREFIX)) localStorage.removeItem(storedKey)
    }
  } catch {
    // Storage may be disabled.
  }
}

async function cacheRequest(text: string, voice: string) {
  const bytes = new TextEncoder().encode(`${voice}\u0000${text.trim().toLowerCase()}`)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
  return new Request(`${window.location.origin}/__readlab_audio_cache__/${hash}`)
}

async function read(text: string, voice: string) {
  if (!("caches" in window)) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(await cacheRequest(text, voice))
    return response ? await response.text() : null
  } catch {
    return null
  }
}

async function write(text: string, voice: string, src: string) {
  if (!("caches" in window)) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(await cacheRequest(text, voice), new Response(src, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }))
  } catch {
    // The generated audio remains available for the current playback.
  }
}

async function remove(text: string, voice: string) {
  if (!("caches" in window)) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.delete(await cacheRequest(text, voice))
  } catch {
    // Regeneration may continue even when cache cleanup is unavailable.
  }
}

export function useReadLabAudio() {
  const [states, setStates] = useState<Record<string, AudioStatus>>({})
  const inflight = useRef(new Map<string, Promise<string | null>>())
  const migrated = useRef(false)

  const generate = useCallback(async (text: string, voice: string, regenerate = false) => {
    const normalized = text.trim()
    if (!normalized) return null
    if (!migrated.current) {
      purgeLegacyCache()
      migrated.current = true
    }
    const cacheKey = key(normalized, voice)
    if (regenerate) {
      await remove(normalized, voice)
    } else {
      const cached = await read(normalized, voice)
      if (cached) {
        setStates((old) => ({ ...old, [cacheKey]: "ready" }))
        return cached
      }
    }
    const pending = inflight.current.get(cacheKey)
    if (pending) return pending

    const request = (async () => {
      setStates((old) => ({ ...old, [cacheKey]: "loading" }))
      try {
        const response = await fetch("/api/readlab/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: normalized, voice }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || "Falha ao gerar áudio")
        if (!body?.data) throw new Error("Resposta de áudio vazia")
        const src = `data:${body.mimeType || "audio/wav"};base64,${body.data}`
        await write(normalized, voice, src)
        setStates((old) => ({ ...old, [cacheKey]: "ready" }))
        return src
      } catch {
        setStates((old) => ({ ...old, [cacheKey]: "error" }))
        return null
      } finally {
        inflight.current.delete(cacheKey)
      }
    })()
    inflight.current.set(cacheKey, request)
    return request
  }, [])

  const statusFor = useCallback((text: string, voice: string): AudioStatus => {
    const cacheKey = key(text, voice)
    return states[cacheKey] ?? "idle"
  }, [states])

  return { generate, statusFor }
}
