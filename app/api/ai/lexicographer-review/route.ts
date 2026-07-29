import { NextResponse } from "next/server"
import type { FlashcardAIResponse } from "@/lib/openai"
import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"

import { guardApiRequest, readJsonWithLimit, resolveAllowedAiModel, safeApiError } from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const LEXICOGRAPHER_REVIEW_AI_MODEL =
  process.env.LEXICOGRAPHER_REVIEW_AI_MODEL ??
  process.env.DEFAULT_AI_MODEL ??
  "ibm-granite/granite-4.1-8b"

interface OpenRouterMessage {
  role: "system" | "user"
  content: string
}

interface LexicographerReviewResponse {
  approved: boolean
  reason: string
  issues: { field: string; problem: string }[]
  corrected: {
    partOfSpeech?: string
    grammaticalForm?: string
    alternativeForms?: { word?: unknown; partOfSpeech?: unknown }[]
  } | null
}

function parseJsonContent<T>(raw: string): T {
  const text = raw.replace(/^\uFEFF/, "").trim()
  try {
    return JSON.parse(text) as T
  } catch {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1)) as T
    throw new Error("Resposta da IA nao veio em JSON valido")
  }
}

async function reviewFamily(
  messages: OpenRouterMessage[],
  model: string
): Promise<LexicographerReviewResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY nao configurada no servidor.")

  const requestedModel = model
  const activeModel = resolveGraniteModel(requestedModel)
  const startedAt = Date.now()
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": ((globalThis as any).process?.env?.NEXT_PUBLIC_SITE_URL as string) ?? "http://localhost:3000",
      "X-OpenRouter-Title": "VocabLab - Lexicographer Review",
    },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      model: activeModel,
      messages,
      temperature: 0.1,
      max_tokens: 360,
      provider: { sort: "throughput" },
      response_format: { type: "json_object" },
    }),
  })

  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`)
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  recordGranitePerformance(requestedModel, Date.now() - startedAt, data)
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("Resposta da IA vazia")
  return parseJsonContent<LexicographerReviewResponse>(content)
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:lexicographer-review", { limit: 20 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 300_000)
    const word = String(body?.word ?? "").trim()
    const card = body?.card as FlashcardAIResponse | undefined
    const targetPartOfSpeech = String(body?.targetPartOfSpeech ?? "").trim()
    const model = resolveAllowedAiModel(body?.model, LEXICOGRAPHER_REVIEW_AI_MODEL)

    if (!word || !card) {
      return NextResponse.json({ error: "word and card are required" }, { status: 400 })
    }

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: `You are a conservative English learner-dictionary reviewer.
Do not rewrite lexical content: never change normalizedWord, translation, context, example, IPA, synonyms, antonyms, or conjugations.
Audit the structural classification, grammaticalForm, and alternativeForms.
- grammaticalForm is independent from partOfSpeech and must be one of base-form, comparative, superlative, plural, past, past-participle, present-participle, third-person-singular.
- Verify it against the exact written word and example. Do not turn comparative/superlative/etc. into a POS.
- Use "phrasal-verb" only for a verb plus particle/preposition functioning as one lexical unit (put off, run out of, look up).
- Use "idiom" for a non-phrasal idiomatic expression (kick the bucket, piece of cake).
- A phrasal-verb must have alternativeForms=[].
- Reject archaic, unrelated, invented, inflected, or POS-mismatched alternative forms.

Return only JSON:
{"approved":true,"reason":"","issues":[],"corrected":null}
or, if family members must be removed:
{"approved":false,"reason":"short reason","issues":[{"field":"partOfSpeech|grammaticalForm|alternativeForms","problem":"short reason"}],"corrected":{"partOfSpeech":"existing or corrected POS","grammaticalForm":"correct form","alternativeForms":[{"word":"existing word","partOfSpeech":"existing POS"}]}}

When rejecting alternatives, corrected.alternativeForms must be a strict subset of the supplied alternatives. Never add, rename, translate, or complete forms.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          word,
          targetPartOfSpeech: targetPartOfSpeech || undefined,
          mainPartOfSpeech: card.partOfSpeech,
          grammaticalForm: card.grammaticalForm,
          usageStatus: card.usageStatus,
          alternativeForms: card.alternativeForms.map(({ word, partOfSpeech, translation }) => ({ word, partOfSpeech, translation })),
        }),
      },
    ]

    return NextResponse.json(await reviewFamily(messages, model))
  } catch (err) {
    return safeApiError(err, "O revisor lexicográfico está temporariamente indisponível.")
  }
}
