import { NextResponse } from "next/server"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import { normalizeSyncCode } from "@/lib/sync-schema"
import {
  createSyncServerClient,
  getSyncServerConfig,
  hashSyncCode,
  listStoredSyncDevices,
  normalizeOwnerToken,
  normalizeSyncDeviceId,
  normalizeSyncDeviceKind,
  normalizeSyncDeviceLabel,
  normalizeSyncDeviceRole,
  revokeStoredSyncDevice,
  setStoredSyncDeviceRole,
  touchSyncDevice,
  verifySyncOwner,
} from "@/lib/sync-server"

type DevicesRequest = {
  action?: unknown
  syncCode?: unknown
  ownerToken?: unknown
  deviceId?: unknown
  deviceLabel?: unknown
  deviceKind?: unknown
  actorDeviceId?: unknown
  role?: unknown
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "sync:devices", { limit: 60 })
  if (blocked) return blocked

  try {
    const body = await readJsonWithLimit<DevicesRequest>(request, 10_000)
    const action = body.action === "list" || body.action === "touch" || body.action === "revoke" || body.action === "set-role"
      ? body.action
      : ""
    const syncCode = normalizeSyncCode(body.syncCode)
    const ownerToken = normalizeOwnerToken(body.ownerToken)
    if (!action || !syncCode || !ownerToken) {
      return NextResponse.json({ error: "Dados de dispositivo inválidos." }, { status: 400 })
    }

    const config = getSyncServerConfig()
    const supabase = createSyncServerClient(config)
    const syncHash = hashSyncCode(syncCode, config.pepper)
    if (!await verifySyncOwner(supabase, syncHash, ownerToken, config.pepper)) {
      return NextResponse.json({ error: "Este navegador não está autorizado." }, { status: 403 })
    }

    if (action === "list") {
      const devices = await listStoredSyncDevices(supabase, syncHash)
      if (devices === null) {
        return NextResponse.json(
          {
            error: "A lista de dispositivos ainda não foi ativada no banco. Execute a migração de dispositivos no Supabase.",
            code: "SYNC_DEVICES_MIGRATION_REQUIRED",
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ devices, count: devices.length })
    }

    if (action === "touch") {
      const deviceId = normalizeSyncDeviceId(body.deviceId)
      if (!deviceId) return NextResponse.json({ error: "Dispositivo inválido." }, { status: 400 })
      const available = await touchSyncDevice(supabase, syncHash, ownerToken, config.pepper, {
        id: deviceId,
        label: normalizeSyncDeviceLabel(body.deviceLabel),
        kind: normalizeSyncDeviceKind(body.deviceKind),
      })
      if (!available) {
        return NextResponse.json({ error: "A lista de dispositivos ainda não foi ativada no banco.", code: "SYNC_DEVICES_MIGRATION_REQUIRED" }, { status: 503 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === "set-role") {
      const targetDeviceId = normalizeSyncDeviceId(body.deviceId)
      const actorDeviceId = normalizeSyncDeviceId(body.actorDeviceId)
      if (!targetDeviceId || !actorDeviceId) return NextResponse.json({ error: "Dispositivo invÃ¡lido." }, { status: 400 })
      const updated = await setStoredSyncDeviceRole(
        supabase,
        syncHash,
        ownerToken,
        config.pepper,
        actorDeviceId,
        targetDeviceId,
        normalizeSyncDeviceRole(body.role),
      )
      if (updated === null) {
        return NextResponse.json({ error: "A lista de dispositivos ainda nÃ£o foi ativada no banco.", code: "SYNC_DEVICES_MIGRATION_REQUIRED" }, { status: 503 })
      }
      if (updated === "forbidden") return NextResponse.json({ error: "Somente a conexÃ£o primÃ¡ria pode alterar outro dispositivo.", code: "SYNC_PRIMARY_REQUIRED" }, { status: 403 })
      if (!updated) return NextResponse.json({ error: "Dispositivo nÃ£o encontrado." }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    const deviceId = normalizeSyncDeviceId(body.deviceId)
    if (!deviceId) return NextResponse.json({ error: "Dispositivo inválido." }, { status: 400 })
    const revoked = await revokeStoredSyncDevice(supabase, syncHash, deviceId)
    if (revoked === null) {
      return NextResponse.json(
        { error: "A lista de dispositivos ainda não foi ativada no banco. Execute a migração de dispositivos no Supabase.", code: "SYNC_DEVICES_MIGRATION_REQUIRED" },
        { status: 503 },
      )
    }
    if (!revoked) return NextResponse.json({ error: "Dispositivo não encontrado." }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return safeApiError(error, "Não foi possível gerenciar os dispositivos.")
  }
}
