"use client"

import { useEffect } from "react"
import { useSyncCode } from "@/hooks/use-sync-code"
import {
  AI_PREFERENCES_UPDATED_EVENT,
  FLASHCARDS_UPDATED_EVENT,
  PROGRESS_UPDATED_EVENT,
  QUESTIONLAB_DATA_UPDATED_EVENT,
  READLAB_TEXTS_UPDATED_EVENT,
  REGENCYLAB_CARDS_UPDATED_EVENT,
  REGENCYLAB_PREFERENCES_UPDATED_EVENT,
  REVIEW_MISTAKE_THRESHOLD_UPDATED_EVENT,
  RULELAB_CARDS_UPDATED_EVENT,
} from "@/lib/constants"
import { READLAB_PREFERENCES_UPDATED_EVENT } from "@/hooks/use-readlab-preferences"
import {
  publishAutoSyncState,
  SYNC_IDENTITY_UPDATED_EVENT,
  synchronizeLab,
} from "@/lib/auto-sync-client"
import { SYNC_LABS } from "@/lib/sync-client"
import type { SyncLabId } from "@/lib/sync-schema"

const EVENT_LABS: Record<string, SyncLabId[]> = {
  [FLASHCARDS_UPDATED_EVENT]: ["vocab"],
  [AI_PREFERENCES_UPDATED_EVENT]: ["vocab"],
  [REGENCYLAB_CARDS_UPDATED_EVENT]: ["regency"],
  [REGENCYLAB_PREFERENCES_UPDATED_EVENT]: ["regency"],
  [RULELAB_CARDS_UPDATED_EVENT]: ["rule"],
  [READLAB_TEXTS_UPDATED_EVENT]: ["read"],
  [READLAB_PREFERENCES_UPDATED_EVENT]: ["read"],
  [PROGRESS_UPDATED_EVENT]: ["question"],
  [QUESTIONLAB_DATA_UPDATED_EVENT]: ["question"],
  "vocablab-card-shape-updated": ["general"],
  [REVIEW_MISTAKE_THRESHOLD_UPDATED_EVENT]: ["general"],
  "vocablab-folder-colors-updated": ["vocab"],
  "regencylab-folder-colors-updated": ["regency"],
}

function syncErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim()
    if (message) return message
  }
  if (typeof error === "string" && error.trim()) return error
  return "Falha de sincronização."
}

export function AutoSyncProvider() {
  const { syncCode, isValid, isIdentityLocked, isSyncEnabled, isLoaded } = useSyncCode()

  useEffect(() => {
    if (!isLoaded) return undefined
    if (!isValid || !isIdentityLocked || !isSyncEnabled) {
      publishAutoSyncState({
        state: "idle",
        message: !isSyncEnabled && isValid && isIdentityLocked
          ? "A sincronização está desativada neste dispositivo."
          : isValid
          ? "Confirme a palavra e o PIN para ativar a sincronização automática."
          : "Escolha uma palavra e confirme os dados para ativar a sincronização automática.",
      })
      return undefined
    }

    let disposed = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const pending = new Set<SyncLabId>()
    const revisions: Partial<Record<SyncLabId, number>> = {}

    const run = async () => {
      if (disposed || running) return
      if (!navigator.onLine) {
        publishAutoSyncState({ state: "offline", message: "Sem conexão. Alterações aguardando envio." })
        return
      }
      running = true
      const requested = pending.size ? [...pending] : [...SYNC_LABS]
      pending.clear()
      publishAutoSyncState({ state: "connecting", message: "Enviando e recebendo atualizações…" })
      try {
        for (const lab of requested) revisions[lab] = await synchronizeLab(syncCode, lab)
        if (!disposed) {
          publishAutoSyncState({
            state: "synced",
            message: "Todos os dados estão sincronizados.",
            updatedAt: Date.now(),
            labs: revisions,
          })
        }
      } catch (error) {
        if (!disposed) {
          publishAutoSyncState({
            state: "error",
            message: syncErrorMessage(error),
            updatedAt: Date.now(),
            labs: revisions,
          })
        }
      } finally {
        running = false
        if (!disposed && pending.size) schedule(1_000, [])
      }
    }

    const schedule = (delay = 900, labs: SyncLabId[] = SYNC_LABS) => {
      for (const lab of labs) pending.add(lab)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void run(), delay)
    }

    schedule(350)
    const interval = window.setInterval(() => schedule(0), 30_000)
    const onFocus = () => schedule(100)
    const onOnline = () => schedule(100)
    window.addEventListener("focus", onFocus)
    window.addEventListener("online", onOnline)
    const cleanups = Object.entries(EVENT_LABS).map(([eventName, labs]) => {
      const listener = () => schedule(900, labs)
      window.addEventListener(eventName, listener)
      return () => window.removeEventListener(eventName, listener)
    })
    const identityListener = () => schedule(200)
    window.addEventListener(SYNC_IDENTITY_UPDATED_EVENT, identityListener)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("online", onOnline)
      for (const cleanup of cleanups) cleanup()
      window.removeEventListener(SYNC_IDENTITY_UPDATED_EVENT, identityListener)
      if (timer) clearTimeout(timer)
    }
  }, [isIdentityLocked, isLoaded, isSyncEnabled, isValid, syncCode])

  return null
}
