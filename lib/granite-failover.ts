const GRANITE_PREFIX = "ibm-granite/"
export const GRANITE_BACKUP_MODEL = process.env.GRANITE_BACKUP_MODEL ?? "sao10k/l3-lunaris-8b"

const HIGH_LATENCY_MS = Number(process.env.GRANITE_HIGH_LATENCY_MS ?? 8_000)
const LOW_TOKENS_PER_SECOND = Number(process.env.GRANITE_LOW_TOKENS_PER_SECOND ?? 8)
const DEGRADED_SAMPLES_TO_OPEN = Number(process.env.GRANITE_DEGRADED_SAMPLES ?? 2)
const CIRCUIT_OPEN_MS = Number(process.env.GRANITE_FAILOVER_COOLDOWN_MS ?? 5 * 60_000)

type GraniteHealth = { degradedSamples: number; openUntil: number; lastLatencyMs: number | null; lastTokensPerSecond: number | null }

const globalHealth = globalThis as typeof globalThis & { __vocabLabGraniteHealthByModel?: Map<string, GraniteHealth> }
const healthByModel = globalHealth.__vocabLabGraniteHealthByModel ??= new Map<string, GraniteHealth>()

function healthFor(model: string) {
  const key = model.toLowerCase()
  const current = healthByModel.get(key)
  if (current) return current
  const created: GraniteHealth = { degradedSamples: 0, openUntil: 0, lastLatencyMs: null, lastTokensPerSecond: null }
  healthByModel.set(key, created)
  return created
}

export function isGraniteModel(model: string) {
  return model.toLowerCase().startsWith(GRANITE_PREFIX)
}

export function resolveGraniteModel(model: string) {
  if (!isGraniteModel(model)) return model
  const health = healthFor(model)
  if (health.openUntil > Date.now()) return GRANITE_BACKUP_MODEL
  if (health.openUntil) {
    health.openUntil = 0
    health.degradedSamples = 0
  }
  return model
}

export function recordGranitePerformance(requestedModel: string, elapsedMs: number, payload: unknown) {
  if (!isGraniteModel(requestedModel)) return
  const health = healthFor(requestedModel)
  const outputTokens = Number((payload as { usage?: { completion_tokens?: unknown } })?.usage?.completion_tokens ?? 0)
  const tokensPerSecond = outputTokens > 0 && elapsedMs > 0 ? outputTokens / (elapsedMs / 1000) : null
  health.lastLatencyMs = elapsedMs
  health.lastTokensPerSecond = tokensPerSecond
  if (tokensPerSecond !== null && elapsedMs >= HIGH_LATENCY_MS && tokensPerSecond < LOW_TOKENS_PER_SECOND) {
    health.degradedSamples += 1
    if (health.degradedSamples >= DEGRADED_SAMPLES_TO_OPEN) health.openUntil = Date.now() + CIRCUIT_OPEN_MS
  } else {
    health.degradedSamples = 0
  }
}

export function graniteFailoverStatus() {
  const now = Date.now()
  const models = [...healthByModel.entries()].map(([model, state]) => ({
    model,
    active: state.openUntil > now,
    openUntil: state.openUntil || null,
    degradedSamples: state.degradedSamples,
    lastLatencyMs: state.lastLatencyMs,
    lastTokensPerSecond: state.lastTokensPerSecond,
  }))
  const active = models.filter((model) => model.active)
  const latest = models.at(-1)
  return {
    active: active.length > 0,
    backupModel: GRANITE_BACKUP_MODEL,
    openUntil: active.length ? Math.max(...active.map((model) => model.openUntil ?? 0)) : null,
    degradedSamples: latest?.degradedSamples ?? 0,
    degradedSamplesThreshold: DEGRADED_SAMPLES_TO_OPEN,
    latencyThresholdMs: HIGH_LATENCY_MS,
    tokensPerSecondThreshold: LOW_TOKENS_PER_SECOND,
    lastLatencyMs: latest?.lastLatencyMs ?? null,
    lastTokensPerSecond: latest?.lastTokensPerSecond ?? null,
    models,
  }
}
