import { randomInt } from "node:crypto"
import { NextResponse } from "next/server"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import { normalizeSyncCode } from "@/lib/sync-schema"
import {
  createSyncServerClient,
  getSyncClaimsTable,
  getSyncServerConfig,
  hashPairingCode,
  hashSyncCode,
  normalizeOwnerToken,
  verifySyncOwner,
} from "@/lib/sync-server"

type PairStartRequest = {
  syncCode?: unknown
  ownerToken?: unknown
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "sync:pair:start", { limit: 10 })
  if (blocked) return blocked

  try {
    const body = await readJsonWithLimit<PairStartRequest>(request, 10_000)
    const syncCode = normalizeSyncCode(body.syncCode)
    const ownerToken = normalizeOwnerToken(body.ownerToken)
    if (!syncCode || !ownerToken) {
      return NextResponse.json({ error: "Identificação inválida." }, { status: 400 })
    }

    const config = getSyncServerConfig()
    const supabase = createSyncServerClient(config)
    const syncHash = hashSyncCode(syncCode, config.pepper)
    if (!await verifySyncOwner(supabase, syncHash, ownerToken, config.pepper)) {
      return NextResponse.json({ error: "Este navegador não está autorizado." }, { status: 403 })
    }

    const pairingCode = String(randomInt(0, 1_000_000)).padStart(6, "0")
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
    const { error } = await supabase
      .from(getSyncClaimsTable())
      .update({
        pairing_code_hash: hashPairingCode(syncHash, pairingCode, config.pepper),
        pairing_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("sync_code", syncHash)
    if (error) throw error

    return NextResponse.json({ pairingCode, expiresAt })
  } catch (error) {
    return safeApiError(error, "Não foi possível iniciar o pareamento.")
  }
}
