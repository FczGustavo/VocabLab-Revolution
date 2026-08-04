"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { SYNC_IDENTITY_UPDATED_EVENT } from "@/lib/auto-sync-client"
import { getOrCreateSyncDeviceId } from "@/lib/sync-device"
import { listSyncDevices, revokeSyncDevice, type SyncDevice } from "@/lib/sync-identity-client"

type SyncDeviceWithCurrent = SyncDevice & { current: boolean }

export function useSyncDevices(syncCode: string, enabled: boolean) {
  const [devices, setDevices] = useState<SyncDeviceWithCurrent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error & { code?: string } | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const currentId = useMemo(() => {
    if (typeof window === "undefined") return ""
    return getOrCreateSyncDeviceId()
  }, [syncCode])

  const refresh = useCallback(async () => {
    if (!enabled || !syncCode) {
      setDevices([])
      setError(null)
      return
    }
    setLoading(true)
    try {
      const result = await listSyncDevices(syncCode)
      setDevices(result.devices.map((device) => ({ ...device, current: device.id === currentId })))
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error
        ? nextError as Error & { code?: string }
        : new Error("Não foi possível carregar os dispositivos."))
    } finally {
      setLoading(false)
    }
  }, [currentId, enabled, syncCode])

  useEffect(() => { void refresh() }, [refresh, refreshToken])

  useEffect(() => {
    const onIdentityChange = () => setRefreshToken((value) => value + 1)
    window.addEventListener(SYNC_IDENTITY_UPDATED_EVENT, onIdentityChange)
    const interval = window.setInterval(() => setRefreshToken((value) => value + 1), 30_000)
    return () => {
      window.removeEventListener(SYNC_IDENTITY_UPDATED_EVENT, onIdentityChange)
      window.clearInterval(interval)
    }
  }, [])

  const revoke = useCallback(async (deviceId: string) => {
    if (!syncCode) return
    await revokeSyncDevice(syncCode, deviceId)
    setDevices((current) => current.filter((device) => device.id !== deviceId))
  }, [syncCode])

  return { devices, loading, error, refresh, revoke }
}
