import { NextResponse } from "next/server"
import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"
import { guardApiRequest, readJsonWithLimit, resolveAllowedAiModel, safeApiError } from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
// Fast/cheap mini model by default for the bulk translation dictionary.
// Override via READLAB_AI_MODEL in .env.
const READLAB_AI_MODEL =
  process.env.READLAB_AI_MODEL ?? "ibm-granite/granite-4.1-8b"

// Soft cap. The dictionary is generated once per text at save time, so we can
// afford to send a generous payload. We still cap to keep latency / cost sane.
const MAX_CONTENT_CHARS = 20000

interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string
    }
  }[]
}

interface ReadLabProcessResponse {
  translationMap: Record<string, string>
}

const COVERAGE_STOP_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "by", "and", "or", "but", "if", "as", "than",
  "that", "this", "these", "those", "it", "its", "itself", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "will", "would", "could", "should", "may", "might", "shall", "can",
  "must", "not", "no", "she", "he", "they", "we", "you", "i", "her", "his", "their", "our", "your",
])

function significantSourceWords(content: string) {
  return [...new Set(
    (content.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [])
      .filter((word) => word.length > 1 && !COVERAGE_STOP_WORDS.has(word))
  )]
}

function parseJsonContent<T>(raw: string): T {
  const normalized = raw.replace(/^\uFEFF/, "").trim()
  try {
    return JSON.parse(normalized) as T
  } catch {
    const fencedBlocks = normalized.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)
    for (const match of fencedBlocks) {
      const block = (match[1] ?? "").trim()
      if (block) {
        try {
          return JSON.parse(block) as T
        } catch {
          continue
        }
      }
    }
    throw new Error("Resposta da IA não veio em JSON válido")
  }
}

async function callOpenRouter<T>(
  messages: OpenRouterMessage[],
  model: string,
  responseFormat?: { type: "json_object" },
  options?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não configurada no servidor.")
  }

  const requestedModel = model
  const activeModel = resolveGraniteModel(requestedModel)
  const startedAt = Date.now()
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      "HTTP-Referer":
        (typeof window !== "undefined" && window.location?.origin) ||
        ((globalThis as any).process?.env?.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
      "X-OpenRouter-Title": "ReadLab - Processamento de Texto",
    },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model: activeModel,
      messages,
      temperature: options?.temperature ?? 0.3,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      provider: {
        sort: "throughput",
      },
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  })

  if (!response.ok) {
    const rawError = await response.text()
    let message = `Erro na chamada da API do OpenRouter (status ${response.status})`
    try {
      const parsed = JSON.parse(rawError) as { error?: { message?: string } }
      if (parsed?.error?.message) {
        message = parsed.error.message
      }
    } catch {
      if (rawError.trim()) {
        message = message + ": " + rawError.slice(0, 300)
      }
    }
    throw new Error(message)
  }

  const data: OpenRouterResponse = await response.json()
  recordGranitePerformance(requestedModel, Date.now() - startedAt, data)
  const content = data.choices[0].message.content
  if (!content) {
    throw new Error("Resposta da IA vazia")
  }
  return parseJsonContent<T>(content)
}

async function callOpenRouterWithRetry<T>(
  messages: OpenRouterMessage[],
  model: string,
  responseFormat?: { type: "json_object" },
  options?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callOpenRouter<T>(messages, model, responseFormat, options)
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 650 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "readlab:process", { limit: 15 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 100_000)
    const content = typeof body?.content === "string" ? body.content : ""
    const model = resolveAllowedAiModel(body?.model, READLAB_AI_MODEL)

    if (!content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 })
    }

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: `You are a professional English-Portuguese translator and lexicographer for Brazilian learners.
Your task is to analyze an English text and create a comprehensive translation dictionary that will power click-to-translate on a reading surface.

Return ONLY valid JSON with this structure:
{
  "translationMap": {
    "word_or_phrase": "traducao em portugues brasileiro"
  }
}

CRITICAL RULES:
- Translate EVERY significant English word in the text: nouns, verbs (in ALL conjugated forms that appear: -s, -ed, -ing, irregulars), adjectives, adverbs, phrasal verbs, collocations, idioms, and expressions.
- For polysemic words, choose the meaning that fits THIS text's context.
- INCLUDE multi-word units as separate entries when they form a semantic unit:
  - Phrasal verbs: "look after" -> "cuidar de", "give up" -> "desistir", "run into" -> "encontrar por acaso"
  - Collocations / fixed expressions: "take a seat" -> "sente-se", "in charge of" -> "responsavel por", "as well as" -> "alem de"
  - Noun phrases and compounds that read better as a unit: "decision making" -> "tomada de decisao"
- Also include the lemma (singular / infinitive / base form) of any inflected word you translate, pointing to the SAME translation. Example: if the text has "running", add BOTH "running" and "run" (same value). This makes click-to-translate resilient to selection variance.
- Aim for the HIGHEST coverage practical: at least 95% of content words. The only words you may skip are pure function words: a, an, the, of, in, on, at, to, for, with, by, and, or, but, if, as, than, that, this, these, those, it, its, is, are, was, were, be, been, being, do, does, did, have, has, had, will, would, could, should, may, might, shall, can, must, not, no.
- Keep values concise: 1-3 words normally, up to 5 for idioms.
- Use the 2009 Portuguese Orthographic Agreement (no trema, no pre-accord spellings).
- Keys MUST be lowercase, single-spaced, and contain NO surrounding punctuation.
- Sort entries alphabetically.`
      },
      {
        role: "user",
        content: `Analyze this English text and build the translation dictionary. Translate every significant word and every multi-word expression:\n\n${content.slice(0, MAX_CONTENT_CHARS)}`
      }
    ]

    const data = await callOpenRouterWithRetry<ReadLabProcessResponse>(
      messages,
      model,
      { type: "json_object" },
      { temperature: 0.3 }
    )

    let translationMap = data.translationMap || {}
    const significantWords = significantSourceWords(content)
    const missingWords = significantWords.filter((word) => {
      const value = translationMap[word]
      return typeof value !== "string" || !value.trim()
    })

    // Small bulk models sometimes omit an arbitrary group of content words.
    // Backfill only the missing keys so existing contextual translations stay
    // stable instead of regenerating the complete dictionary.
    if (missingWords.length > 0 && missingWords.length / Math.max(1, significantWords.length) > 0.05) {
      const backfill = await callOpenRouterWithRetry<ReadLabProcessResponse>(
        [
          {
            role: "system",
            content: `You complete missing entries in an English-to-Brazilian-Portuguese reading dictionary. Return ONLY {"translationMap":{"word":"tradução"}}. Translate every supplied key in the sense used by the source text. Keys must be lowercase and unchanged. Values must be concise, natural pt-BR. Do not omit any key and do not add unrelated keys.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              sourceText: content.slice(0, MAX_CONTENT_CHARS),
              missingKeys: missingWords.slice(0, 100),
            }),
          },
        ],
        model,
        { type: "json_object" },
        { temperature: 0.1, maxTokens: 700 },
      )
      translationMap = {
        ...translationMap,
        ...(backfill.translationMap || {}),
      }
    }

    return NextResponse.json({ translationMap })
  } catch (err) {
    return safeApiError(err, "Erro ao processar texto")
  }
}
