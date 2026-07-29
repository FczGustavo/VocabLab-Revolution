import { NextResponse } from "next/server"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import { normalizeSyncCode } from "@/lib/sync-schema"
import {
  createSyncServerClient,
  getSyncClaimsTable,
  getSyncServerConfig,
  hashOwnerToken,
  hashSyncCode,
  normalizeOwnerToken,
  verifySyncOwner,
} from "@/lib/sync-server"

type ClaimRequest = {
  syncCode?: unknown
  ownerToken?: unknown
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "sync:claim", { limit: 20 })
  if (blocked) return blocked

  try {
    const body = await readJsonWithLimit<ClaimRequest>(request, 10_000)
    const syncCode = normalizeSyncCode(body.syncCode)
    const ownerToken = normalizeOwnerToken(body.ownerToken)
    if (!syncCode || !ownerToken) {
      return NextResponse.json(
        { error: "Palavra, PIN ou token do navegador inválido." },
        { status: 400 },
      )
    }

    const config = getSyncServerConfig()
    const supabase = createSyncServerClient(config)
    const table = getSyncClaimsTable()
    const syncHash = hashSyncCode(syncCode, config.pepper)
    const tokenHash = hashOwnerToken(ownerToken, config.pepper)
    const { error: insertError } = await supabase.from(table).insert({
      sync_code: syncHash,
      device_token_hashes: [tokenHash],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (!insertError) {
      return NextResponse.json({ ok: true, claimed: true })
    }
    if (insertError.code !== "23505") throw insertError

    if (await verifySyncOwner(supabase, syncHash, ownerToken, config.pepper)) {
      return NextResponse.json({ ok: true, claimed: false })
    }

    return NextResponse.json(
      {
        error: "Esta palavra e PIN já estão em uso.",
        code: "SYNC_IDENTITY_TAKEN",
      },
      { status: 409 },
    )
  } catch (error) {
    return safeApiError(error, "Não foi possível verificar esta identificação.")
  }
}
