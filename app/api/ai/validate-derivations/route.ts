import { NextResponse } from "next/server"
import { MAX_AMBIGUOUS_DERIVATIONS } from "@/lib/derivation-validation"
import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"

import { guardApiRequest, readJsonWithLimit, resolveAllowedAiModel, safeApiError } from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const VALIDATE_DERIVATIONS_AI_MODEL =
  process.env.VALIDATE_DERIVATIONS_AI_MODEL ??
  process.env.DEFAULT_AI_MODEL ??
  "ibm-granite/granite-4.1-8b"

interface DerivationInput {
  word: string
  partOfSpeech: string
}

interface ValidationResponse {
  valid: DerivationInput[]
  invalid: { word: string; reason: string }[]
}

function parseJsonContent<T>(raw: string): T {
  const normalized = raw.replace(/^\uFEFF/, "").trim()
  try {
    return JSON.parse(normalized) as T
  } catch {
    const start = normalized.indexOf("{")
    const end = normalized.lastIndexOf("}")
    if (start !== -1 && end > start) return JSON.parse(normalized.slice(start, end + 1)) as T
    throw new Error("Resposta da IA não veio em JSON válido")
  }
}

async function validateWithModel(
  model: string,
  baseWord: string,
  basePos: string,
  derivations: DerivationInput[]
): Promise<ValidationResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada no servidor.")

  const messages = [
    {
      role: "system" as const,
      content: `You are a strict English lexicographer. Classify each proposed word+POS as a common, modern English lexical-family member of the base word.

Reject unrelated spelling coincidences, inflections, non-words, and archaic, rare, specialized, or set-phrase-only senses. Accept only real learner-dictionary headwords. Same-spelling POS shifts are valid only when the target POS is current and common.

Return ONLY {"valid":[{"word":"...","partOfSpeech":"..."}],"invalid":[{"word":"...","reason":"unrelated"|"not a real word"|"archaic sense"}]}. Preserve exact input word and partOfSpeech for valid items.`,
    },
    {
      role: "user" as const,
      content: `Base word: "${baseWord}" (${basePos || "unspecified"})\nDerivations:\n${derivations.map((d, index) => `${index + 1}. "${d.word}" (${d.partOfSpeech})`).join("\n")}`,
    },
  ]

  const requestedModel = model
  const activeModel = resolveGraniteModel(requestedModel)
  const startedAt = Date.now()
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-OpenRouter-Title": "VocabLab - Derivation Validation",
    },
    signal: AbortSignal.timeout(7_000),
    body: JSON.stringify({
      model: activeModel,
      messages,
      temperature: 0,
      max_tokens: 160,
      // The validator emits only a small JSON classification. Disabling
      // reasoning prevents a long hidden chain-of-thought from blocking card
      // creation while preserving GLM for the genuinely ambiguous cases.
      ...(model.startsWith("z-ai/glm-4.7") ? { reasoning: { effort: "none", exclude: true } } : {}),
      provider: { sort: "throughput" },
      response_format: { type: "json_object" },
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro na chamada do validador (status ${response.status})`)
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  recordGranitePerformance(requestedModel, Date.now() - startedAt, payload)
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error("Resposta do validador vazia")
  return parseJsonContent<ValidationResponse>(content)
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:validate-derivations", { limit: 30 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 100_000)
    const baseWord = String(body?.baseWord ?? "").trim()
    const basePos = String(body?.basePartOfSpeech ?? "").trim()
    const rawDerivations: unknown[] = Array.isArray(body?.derivations) ? body.derivations : []
    const derivations = rawDerivations
      .slice(0, MAX_AMBIGUOUS_DERIVATIONS)
      .map((entry: unknown): DerivationInput => {
        const value = entry as { word?: unknown; partOfSpeech?: unknown }
        return {
          word: String(value?.word ?? "").trim(),
          partOfSpeech: String(value?.partOfSpeech ?? "").trim(),
        }
      })
      .filter((entry: DerivationInput) => entry.word.length > 0 && entry.partOfSpeech.length > 0)

    if (!baseWord) return NextResponse.json({ error: "baseWord is required" }, { status: 400 })
    if (derivations.length === 0) return NextResponse.json({ valid: [], invalid: [] })

    const model = resolveAllowedAiModel(body?.model, VALIDATE_DERIVATIONS_AI_MODEL)
    const result = await validateWithModel(model, baseWord, basePos, derivations)
    return NextResponse.json({
      valid: Array.isArray(result.valid) ? result.valid : [],
      invalid: Array.isArray(result.invalid) ? result.invalid : [],
    })
  } catch (err) {
    return safeApiError(err, "O validador de derivações está temporariamente indisponível.")
  }
}
