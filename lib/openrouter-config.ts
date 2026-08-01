/**
 * Shared OpenRouter request configuration.
 *
 * Reasoning is intentionally opt-in by model so audio and vision requests do
 * not receive a text-only reasoning parameter. Configure it in .env.local:
 * OPENROUTER_REASONING_ENABLED, OPENROUTER_REASONING_MODELS,
 * OPENROUTER_REASONING_EFFORT or OPENROUTER_REASONING_MAX_TOKENS, and
 * OPENROUTER_REASONING_EXCLUDE.
 */

export type OpenRouterReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

const VALID_EFFORTS = new Set<OpenRouterReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
])

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
}

function readPositiveInteger(value: string | undefined) {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function configuredModels() {
  const value = process.env.OPENROUTER_REASONING_MODELS?.trim() || "deepseek/deepseek-v4-flash"
  return value
    .split(",")
    .map((model) => model.trim().toLowerCase())
    .filter(Boolean)
}

function modelIsConfigured(model: string) {
  const normalizedModel = model.trim().toLowerCase()
  return configuredModels().some((configuredModel) =>
    configuredModel === "*" ||
    normalizedModel === configuredModel ||
    normalizedModel.startsWith(`${configuredModel}:`),
  )
}

/**
 * Returns the OpenRouter body fragment for reasoning-enabled models.
 * Returning an empty object keeps unsupported audio/vision models untouched.
 */
export function openRouterReasoning(model: string): {
  reasoning?: {
    effort?: OpenRouterReasoningEffort
    max_tokens?: number
    exclude?: boolean
  }
} {
  if (!modelIsConfigured(model)) return {}

  const enabled = readBoolean(process.env.OPENROUTER_REASONING_ENABLED, true)
  const exclude = readBoolean(process.env.OPENROUTER_REASONING_EXCLUDE, true)
  if (!enabled) return { reasoning: { effort: "none", exclude: true } }

  const maxTokens = readPositiveInteger(process.env.OPENROUTER_REASONING_MAX_TOKENS)
  if (maxTokens) return { reasoning: { max_tokens: maxTokens, exclude } }

  const requestedEffort = process.env.OPENROUTER_REASONING_EFFORT?.trim().toLowerCase() as OpenRouterReasoningEffort | undefined
  const effort = requestedEffort && VALID_EFFORTS.has(requestedEffort) ? requestedEffort : "high"
  return { reasoning: { effort, exclude } }
}
