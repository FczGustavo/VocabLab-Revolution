import { NextResponse } from "next/server"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import {
  normalizeSyncCode,
  SyncLabIdSchema,
  SyncLabPayloadSchema,
} from "@/lib/sync-schema"
import {
  createSyncServerClient,
  getSyncLabTable,
  getSyncServerConfig,
  hashSyncCode,
  normalizeOwnerToken,
  verifySyncOwner,
} from "@/lib/sync-server"

type PushRequest = {
  syncCode?: unknown
  lab?: unknown
  payload?: unknown
  expectedRevision?: unknown
  deviceId?: unknown
  ownerToken?: unknown
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "sync:lab:push", { limit: 180 })
  if (blocked) return blocked

  try {
    const body = await readJsonWithLimit<PushRequest>(request, 8_000_000)
    const syncCode = normalizeSyncCode(body.syncCode)
    const lab = SyncLabIdSchema.safeParse(body.lab)
    const payload = SyncLabPayloadSchema.safeParse(body.payload)
    const ownerToken = normalizeOwnerToken(body.ownerToken)
    const expectedRevision = Number(body.expectedRevision ?? 0)
    const deviceId = typeof body.deviceId === "string"
      && /^[a-zA-Z0-9-]{8,64}$/.test(body.deviceId)
      ? body.deviceId
      : null

    if (
      !syncCode
      || !ownerToken
      || !lab.success
      || !payload.success
      || payload.data.lab !== lab.data
    ) {
      return NextResponse.json(
        { error: "Dados de sincronização inválidos." },
        { status: 400 },
      )
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json({ error: "Revisão inválida." }, { status: 400 })
    }

    const config = getSyncServerConfig()
    const table = getSyncLabTable(lab.data)
    const syncHash = hashSyncCode(syncCode, config.pepper)
    const supabase = createSyncServerClient(config)
    if (!await verifySyncOwner(supabase, syncHash, ownerToken, config.pepper)) {
      return NextResponse.json(
        { error: "Este navegador não está autorizado." },
        { status: 403 },
      )
    }

    const { data: existing, error: readError } = await supabase
      .from(table)
      .select("revision")
      .eq("sync_code", syncHash)
      .maybeSingle()
    if (readError) throw readError

    if (!existing) {
      if (expectedRevision !== 0) {
        return NextResponse.json({ error: "O estado remoto mudou." }, { status: 409 })
      }
      const { error } = await supabase.from(table).insert({
        sync_code: syncHash,
        payload: payload.data,
        schema_version: payload.data.version,
        revision: 1,
        last_writer: deviceId,
        updated_at: new Date().toISOString(),
      })
      if (error?.code === "23505") {
        return NextResponse.json({ error: "Conflito de sincronização." }, { status: 409 })
      }
      if (error) throw error
      return NextResponse.json({ ok: true, revision: 1 })
    }

    if (Number(existing.revision) !== expectedRevision) {
      return NextResponse.json(
        { error: "Há uma atualização mais recente.", remoteRevision: existing.revision },
        { status: 409 },
      )
    }

    const nextRevision = expectedRevision + 1
    const { data: updated, error } = await supabase
      .from(table)
      .update({
        payload: payload.data,
        schema_version: payload.data.version,
        revision: nextRevision,
        last_writer: deviceId,
        updated_at: new Date().toISOString(),
      })
      .eq("sync_code", syncHash)
      .eq("revision", expectedRevision)
      .select("revision")
      .maybeSingle()
    if (error) throw error
    if (!updated) {
      return NextResponse.json({ error: "Conflito de sincronização." }, { status: 409 })
    }
    return NextResponse.json({ ok: true, revision: updated.revision })
  } catch (error) {
    return safeApiError(error, "Não foi possível enviar as atualizações.")
  }
}
