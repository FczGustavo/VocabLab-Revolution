import { z } from "zod"

export const SYNC_SCHEMA_VERSION = 2
export const SYNC_LAB_SCHEMA_VERSION = 1

export const SyncLabIdSchema = z.enum([
  "general",
  "vocab",
  "regency",
  "rule",
  "read",
  "question",
])

export type SyncLabId = z.infer<typeof SyncLabIdSchema>

export const SyncTombstoneSchema = z.object({
  id: z.string().min(1).max(300),
  storeName: z.string().min(1).max(100),
  entityId: z.string().min(1).max(200),
  deletedAt: z.number().int().nonnegative(),
}).strict()

export const SyncSnapshotSchema = z.object({
  version: z.literal(SYNC_SCHEMA_VERSION),
  exportedAt: z.number().int().nonnegative(),
  databases: z.record(
    z.string(),
    z.record(z.string(), z.array(z.unknown()).max(25_000)),
  ),
  preferences: z.record(z.string(), z.string().max(100_000)),
  syncTombstones: z.record(
    SyncLabIdSchema.exclude(["general"]),
    z.array(SyncTombstoneSchema).max(5_000),
  ).optional(),
}).strict()

export type SyncSnapshot = z.infer<typeof SyncSnapshotSchema>

export const SyncLabPayloadSchema = z.object({
  version: z.literal(SYNC_LAB_SCHEMA_VERSION),
  lab: SyncLabIdSchema,
  exportedAt: z.number().int().nonnegative(),
  stores: z.record(z.string(), z.array(z.unknown()).max(25_000)),
  preferences: z.record(z.string(), z.string().max(100_000)),
}).strict()

export type SyncLabPayload = z.infer<typeof SyncLabPayloadSchema>

export const SyncOperationSchema = z.object({
  operationId: z.string().min(12).max(180),
  lab: SyncLabIdSchema,
  kind: z.enum(["upsert", "delete", "preference-set", "preference-delete"]),
  storeName: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(300),
  value: z.unknown().optional(),
  occurredAt: z.number().int().nonnegative(),
}).strict().superRefine((operation, context) => {
  const isPreference = operation.kind.startsWith("preference-")
  if (isPreference && operation.storeName !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Preferências não usam storeName." })
  }
  if (!isPreference && !operation.storeName) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Operações de dados exigem storeName." })
  }
  if ((operation.kind === "upsert" || operation.kind === "preference-set") && operation.value === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A operação exige value." })
  }
})

export type SyncOperation = z.infer<typeof SyncOperationSchema>

export function normalizeSyncWord(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24)
}

export function normalizeSyncCode(value: unknown) {
  if (typeof value !== "string") return ""
  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9]{2,24}-\d{4}$/.test(normalized) ? normalized : ""
}
