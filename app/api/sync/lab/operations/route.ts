import { NextResponse } from "next/server"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import { normalizeSyncCode, SyncLabIdSchema, SyncOperationSchema } from "@/lib/sync-schema"
import {
  createSyncServerClient,
  getSyncOperationsTable,
  getSyncServerConfig,
  hashSyncCode,
  normalizeOwnerToken,
  normalizeSyncDeviceId,
  normalizeSyncDeviceKind,
  normalizeSyncDeviceLabel,
  touchSyncDevice,
  verifySyncOwner,
} from "@/lib/sync-server"

type OperationsRequest = {
  action?: unknown
  syncCode?: unknown
  lab?: unknown
  ownerToken?: unknown
  deviceId?: unknown
  deviceLabel?: unknown
  deviceKind?: unknown
  cursor?: unknown
  operations?: unknown
}

const PAGE_SIZE = 500

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "sync:lab:operations", { limit: 240 })
  if (blocked) return blocked

  try {
    const body = await readJsonWithLimit<OperationsRequest>(request, 2_000_000)
    const action = body.action === "push" || body.action === "pull" ? body.action : ""
    const syncCode = normalizeSyncCode(body.syncCode)
    const lab = SyncLabIdSchema.safeParse(body.lab)
    const ownerToken = normalizeOwnerToken(body.ownerToken)
    const deviceId = normalizeSyncDeviceId(body.deviceId)
    if (!action || !syncCode || !lab.success || !ownerToken || !deviceId) {
      return NextResponse.json({ error: "Dados de sincronização inválidos." }, { status: 400 })
    }

    const config = getSyncServerConfig()
    const syncHash = hashSyncCode(syncCode, config.pepper)
    const supabase = createSyncServerClient(config)
    if (!await verifySyncOwner(supabase, syncHash, ownerToken, config.pepper)) {
      return NextResponse.json({ error: "Este navegador não está autorizado." }, { status: 403 })
    }
    await touchSyncDevice(supabase, syncHash, ownerToken, config.pepper, {
      id: deviceId,
      label: normalizeSyncDeviceLabel(body.deviceLabel),
      kind: normalizeSyncDeviceKind(body.deviceKind),
    })

    const table = getSyncOperationsTable()
    if (action === "push") {
      const parsed = Array.isArray(body.operations)
        ? body.operations.map((value) => SyncOperationSchema.safeParse(value))
        : []
      if (parsed.length > 250 || parsed.some((result) => !result.success)) {
        return NextResponse.json({ error: "Operações de sincronização inválidas." }, { status: 400 })
      }
      const operations = parsed.map((result) => result.data!).filter((operation) => operation.lab === lab.data)
      if (operations.length !== parsed.length) {
        return NextResponse.json({ error: "A operação não pertence ao Lab informado." }, { status: 400 })
      }
      if (operations.length > 0) {
        const { error } = await supabase.from(table).upsert(
          operations.map((operation) => ({
            sync_code: syncHash,
            lab: operation.lab,
            operation_id: operation.operationId,
            device_id: deviceId,
            kind: operation.kind,
            store_name: operation.storeName ?? null,
            entity_id: operation.entityId,
            value: operation.value ?? null,
            occurred_at: operation.occurredAt,
          })),
          { onConflict: "sync_code,operation_id", ignoreDuplicates: true },
        )
        if (error) throw error
      }
      return NextResponse.json({ ok: true, accepted: operations.length })
    }

    const cursor = Number(body.cursor ?? 0)
    if (!Number.isInteger(cursor) || cursor < 0) {
      return NextResponse.json({ error: "Cursor de sincronização inválido." }, { status: 400 })
    }
    const { data, error } = await supabase
      .from(table)
      .select("sequence, operation_id, lab, kind, store_name, entity_id, value, occurred_at")
      .eq("sync_code", syncHash)
      .eq("lab", lab.data)
      .gt("sequence", cursor)
      .order("sequence", { ascending: true })
      .limit(PAGE_SIZE)
    if (error) throw error
    const operations = (data ?? []).flatMap((row) => {
      const parsed = SyncOperationSchema.safeParse({
        operationId: row.operation_id,
        lab: row.lab,
        kind: row.kind,
        storeName: row.store_name ?? undefined,
        entityId: row.entity_id,
        value: row.value ?? undefined,
        occurredAt: Number(row.occurred_at),
      })
      return parsed.success ? [{ sequence: Number(row.sequence), operation: parsed.data }] : []
    })
    const nextCursor = operations.at(-1)?.sequence ?? cursor
    return NextResponse.json({ operations, cursor: nextCursor, hasMore: operations.length === PAGE_SIZE })
  } catch (error) {
    const code = String((error as { code?: unknown } | null)?.code ?? "")
    const message = String((error as { message?: unknown } | null)?.message ?? error ?? "").toLowerCase()
    if (code === "42P01" || message.includes("vocablab_sync_operations")) {
      return NextResponse.json(
        {
          error: "A sincronização multi-dispositivo ainda não foi ativada no banco. Execute a migração 202608030001_multiwriter_sync_operations.sql no Supabase.",
          code: "SYNC_OPERATIONS_MIGRATION_REQUIRED",
        },
        { status: 503 },
      )
    }
    return safeApiError(error, "Não foi possível sincronizar as alterações.")
  }
}
