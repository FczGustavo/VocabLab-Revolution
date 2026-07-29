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

type PullRequest = {
  syncCode?: unknown
  lab?: unknown
  ownerToken?: unknown
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "sync:lab:pull", { limit: 180 })
  if (blocked) return blocked

  try {
    const body = await readJsonWithLimit<PullRequest>(request, 10_000)
    const syncCode = normalizeSyncCode(body.syncCode)
    const lab = SyncLabIdSchema.safeParse(body.lab)
    const ownerToken = normalizeOwnerToken(body.ownerToken)
    if (!syncCode || !lab.success || !ownerToken) {
      return NextResponse.json(
        { error: "Código, Lab ou autorização inválida." },
        { status: 400 },
      )
    }

    const config = getSyncServerConfig()
    const supabase = createSyncServerClient(config)
    const syncHash = hashSyncCode(syncCode, config.pepper)
    if (!await verifySyncOwner(supabase, syncHash, ownerToken, config.pepper)) {
      return NextResponse.json(
        { error: "Este navegador não está autorizado." },
        { status: 403 },
      )
    }

    const { data, error } = await supabase
      .from(getSyncLabTable(lab.data))
      .select("payload, updated_at, revision, schema_version")
      .eq("sync_code", syncHash)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ payload: null, revision: 0 })
    const payload = SyncLabPayloadSchema.safeParse(data.payload)
    if (!payload.success || payload.data.lab !== lab.data) {
      return NextResponse.json(
        { error: "Os dados remotos usam um formato incompatível." },
        { status: 409 },
      )
    }
    return NextResponse.json({
      payload: payload.data,
      revision: data.revision,
      updatedAt: data.updated_at,
      schemaVersion: data.schema_version,
    })
  } catch (error) {
    return safeApiError(error, "Não foi possível receber as atualizações.")
  }
}
