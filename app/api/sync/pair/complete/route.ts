import { NextResponse } from "next/server"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import { normalizeSyncCode } from "@/lib/sync-schema"
import {
  createSyncServerClient,
  getSyncClaimsTable,
  getSyncServerConfig,
  hashOwnerToken,
  hashPairingCode,
  hashSyncCode,
  normalizeOwnerToken,
} from "@/lib/sync-server"

type PairCompleteRequest = {
  syncCode?: unknown
  pairingCode?: unknown
  ownerToken?: unknown
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "sync:pair:complete", { limit: 12 })
  if (blocked) return blocked

  try {
    const body = await readJsonWithLimit<PairCompleteRequest>(request, 10_000)
    const syncCode = normalizeSyncCode(body.syncCode)
    const ownerToken = normalizeOwnerToken(body.ownerToken)
    const pairingCode = typeof body.pairingCode === "string"
      ? body.pairingCode.replace(/\D/g, "").slice(0, 6)
      : ""
    if (!syncCode || !ownerToken || !/^\d{6}$/.test(pairingCode)) {
      return NextResponse.json({ error: "Dados de pareamento inválidos." }, { status: 400 })
    }

    const config = getSyncServerConfig()
    const supabase = createSyncServerClient(config)
    const table = getSyncClaimsTable()
    const syncHash = hashSyncCode(syncCode, config.pepper)
    const pairingHash = hashPairingCode(syncHash, pairingCode, config.pepper)
    const { data, error } = await supabase
      .from(table)
      .select("device_token_hashes, pairing_code_hash, pairing_expires_at")
      .eq("sync_code", syncHash)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json(
        {
          error: "Nenhuma sincronização foi encontrada para esta palavra e PIN. Confirme os dados e a configuração do ambiente.",
          code: "SYNC_IDENTITY_NOT_FOUND",
        },
        { status: 404 },
      )
    }

    const expiresAt = Date.parse(String(data.pairing_expires_at ?? ""))
    if (
      data.pairing_code_hash !== pairingHash
      || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now()
    ) {
      return NextResponse.json(
        { error: "Código de pareamento inválido ou expirado." },
        { status: 409 },
      )
    }

    const hashes = Array.isArray(data.device_token_hashes)
      ? data.device_token_hashes.filter((value): value is string => typeof value === "string")
      : []
    const newHash = hashOwnerToken(ownerToken, config.pepper)
    const nextHashes = [...new Set([...hashes, newHash])].slice(-20)
    const { data: updated, error: updateError } = await supabase
      .from(table)
      .update({
        device_token_hashes: nextHashes,
        pairing_code_hash: null,
        pairing_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("sync_code", syncHash)
      .eq("pairing_code_hash", pairingHash)
      .select("sync_code")
      .maybeSingle()
    if (updateError) throw updateError
    if (!updated) {
      return NextResponse.json(
        { error: "Este código de pareamento já foi utilizado." },
        { status: 409 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return safeApiError(error, "Não foi possível concluir o pareamento.")
  }
}
