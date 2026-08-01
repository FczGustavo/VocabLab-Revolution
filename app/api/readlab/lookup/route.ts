import { NextResponse } from "next/server"
import { DEFAULT_AI_MODEL } from "@/lib/openai"
import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"
import { openRouterReasoning } from "@/lib/openrouter-config"
import { guardApiRequest, readJsonWithLimit, resolveAllowedAiModel, safeApiError } from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

// On-demand snippet translation. Fallback chain:
//   1. READLAB_LOOKUP_AI_MODEL (explicit per-lookup override)
//   2. READLAB_AI_MODEL        (shared with bulk processing — matches the
//                              "Also used for on-demand translation" note in .env)
//   3. ibm-granite/granite-4.1-8b (fast/cheap mini default)
const READLAB_LOOKUP_AI_MODEL =
  process.env.READLAB_LOOKUP_AI_MODEL ??
  process.env.READLAB_AI_MODEL ??
  DEFAULT_AI_MODEL

// Cap for the snippet sent to the model. We support everything from a single
// word up to a full paragraph (a few thousand chars). Beyond this we bail.
const MAX_QUERY_CHARS = 6000
// Context is only useful for short selections — for paragraphs the selection
// itself is the context, so we keep a smaller cap and only forward context
// when the query is short enough that surrounding text adds value.
const MAX_CONTEXT_CHARS = 1200
// Threshold that separates a "snippet" (word/phrase/short sentence) from a
// "passage" (multiple sentences / paragraph). Above this we ask the model for
// a full fluent translation instead of a 1-4 word gloss, and we skip the
// dictionary patch (caching a whole paragraph as a dictionary key is useless).
const PASSAGE_QUERY_CHARS = 60
const PASSAGE_QUERY_WORDS = 8

interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OpenRouterResponse {
  choices: { message: { content: string } }[]
}

interface LookupResponse {
  translation: string
  patch: Record<string, string>
}

function parseJsonContent<T>(raw: string): T {
  const normalized = raw.replace(/^\uFEFF/, "").trim()
  try {
    return JSON.parse(normalized) as T
  } catch {
    const fenced = normalized.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)
    for (const match of fenced) {
      const block = (match[1] ?? "").trim()
      if (!block) continue
      try {
        return JSON.parse(block) as T
      } catch {
        continue
      }
    }
    // Last resort: extract the first balanced { ... } block.
    const start = normalized.indexOf("{")
    const end = normalized.lastIndexOf("}")
    if (start !== -1 && end > start) {
      const slice = normalized.slice(start, end + 1)
      try {
        return JSON.parse(slice) as T
      } catch {
        // fall through
      }
    }
    throw new Error("Resposta da IA nao veio em JSON valido")
  }
}

async function callOpenRouter<T>(
  messages: OpenRouterMessage[],
  model: string,
  options?: { temperature?: number }
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY nao configurada no servidor.")
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
        ((globalThis as any).process?.env?.NEXT_PUBLIC_SITE_URL as string) ??
        "http://localhost:3000",
      "X-OpenRouter-Title": "ReadLab - Lookup Sob Demanda",
    },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      model: activeModel,
      messages,
      temperature: options?.temperature ?? 0.2,
      provider: { sort: "throughput" },
      ...openRouterReasoning(activeModel),
      response_format: { type: "json_object" },
    }),
  })

  if (!response.ok) {
    const rawError = await response.text()
    let message = `Erro na chamada da API do OpenRouter (status ${response.status})`
    try {
      const parsed = JSON.parse(rawError) as { error?: { message?: string } }
      if (parsed?.error?.message) message = parsed.error.message
    } catch {
      if (rawError.trim()) message = message + ": " + rawError.slice(0, 300)
    }
    throw new Error(message)
  }

  const data: OpenRouterResponse = await response.json()
  recordGranitePerformance(requestedModel, Date.now() - startedAt, data)
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error("Resposta da IA vazia")
  return parseJsonContent<T>(content)
}

// Normalize a key the same way the client does: lowercase, trim, strip outer
// punctuation, collapse internal whitespace.
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "readlab:lookup", { limit: 40 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 50_000)
    const queryRaw: string = typeof body?.query === "string" ? body.query : ""
    const context: string = typeof body?.context === "string" ? body.context : ""
    const model = resolveAllowedAiModel(body?.model, READLAB_LOOKUP_AI_MODEL)

    const query = queryRaw.trim()
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 })
    }
    if (query.length > MAX_QUERY_CHARS) {
      return NextResponse.json({ error: "query too long" }, { status: 400 })
    }

    // Decide whether this is a short snippet or a passage. We forward context
    // only for short snippets — for passages the selection itself is enough.
    const queryWords = query.split(/\s+/).filter(Boolean).length
    const isPassage = query.length > PASSAGE_QUERY_CHARS || queryWords > PASSAGE_QUERY_WORDS
    const trimmedContext = isPassage ? "" : context.slice(0, MAX_CONTEXT_CHARS)

    const systemPrompt = isPassage
      ? `You are a precise English-to-Brazilian-Portuguese translator for a reading app.
The user selected a longer passage (one or more full sentences, possibly a whole paragraph). Produce a fluent, natural Brazilian-Portuguese translation of the ENTIRE passage that preserves meaning, tense, tone and sentence order.

Return ONLY JSON in this exact shape:

{
  "translation": "<full pt-BR translation of the passage>",
  "patch": {}
}

RULES:
- Translate the WHOLE passage, not a summary or gloss.
- Keep the same number of sentences. Preserve paragraph breaks if any.
- PRESERVE PUNCTUATION: end the translation with the same sentence-final punctuation (. ! ? …) as the source. If the source has a trailing period, the translation MUST end with a period. Internal commas / colons / semicolons must match the source structure.
- CAPITALIZATION: start the translation with an uppercase letter when (and only when) the source passage starts with an uppercase letter (which a sentence almost always does). Preserve the case of proper nouns.
- Use the 2009 Portuguese Orthographic Agreement.
- Natural, fluent pt-BR. Do NOT translate literally word-by-word when a freer rendering reads better.
- "patch" MUST be an empty object {} for passages — do not try to cache paragraph-length text as dictionary keys.
- No explanation, markdown, or text outside the JSON object.`
      : `You are a fast, precise English-to-Brazilian-Portuguese translator for a reading app.
The user selected a short snippet (a word or a few words) inside a larger text and the pre-computed dictionary missed it. The "context" below is the SENTENCE where the snippet actually appears — use it to disambiguate any polysemic word and pick the meaning that fits THIS usage.

Return ONLY JSON in this exact shape:

{
  "translation": "<pt-BR translation of the snippet that fits the context>",
  "patch": {
    "<original snippet lowercased>": "<same translation>",
    "<singular / infinitive / lemma form if applicable>": "<translation in the lemma's own grammatical form>"
  }
}

RULES:
- "translation" must reflect the snippet's meaning IN THE PROVIDED CONTEXT. If the word has multiple meanings, choose the one that matches how it's used in the sentence.
- For prepositions and other function words, never return a vague bare gloss such as "por" or "em", and never return an agreement-bound fragment such as "em todas as". Return a reusable contextual gloss with enough structure, such as "em toda a extensão de", "de um lado ao outro de", or "ao longo de".
- LENGTH: match the snippet's scope. If the snippet is a single word or short phrase, give a concise translation (1-4 words). If the snippet is a FULL SENTENCE, produce a full sentence translation — do NOT truncate.
- PUNCTUATION & CAPITALIZATION: mirror the source. If the snippet ends with ".", "?", "!", or "…", the translation must end with the same mark. If the snippet starts with an uppercase letter, the translation must too. Preserve proper-noun casing.
- "patch" must include at least the normalized snippet as a key. When the snippet is inflected, you may also add its lemma, but translate the lemma in its OWN grammatical form: greatest -> greatest:"maiores", great:"grande"; running -> running:"funcionando", run:"funcionar". Never copy an inflected translation onto its lemma. Keys are lowercase, no surrounding punctuation, single spaces.
- Use the 2009 Portuguese Orthographic Agreement.
- Keep pt-BR natural.
- Do NOT include any explanation, markdown, or text outside the JSON object.`

    const messages: OpenRouterMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: trimmedContext
          ? `Sentence where the snippet appears (use this to disambiguate the meaning):\n\n${trimmedContext}\n\nSnippet to translate:\n\n${query}`
          : `Translate the following passage to Brazilian Portuguese:\n\n${query}`
      }
    ]

    let data = await callOpenRouter<LookupResponse>(messages, model, {
      temperature: 0.2,
    })

    let translation = (data.translation || "").trim()
    const functionWords = new Set([
      "about", "across", "after", "against", "along", "among", "around", "at", "before", "behind",
      "below", "beneath", "beside", "between", "beyond", "by", "despite", "during", "for", "from",
      "in", "inside", "into", "near", "of", "off", "on", "onto", "over", "through", "to", "toward",
      "under", "until", "up", "upon", "with", "within", "without",
    ])
    const vagueFunctionGloss = functionWords.has(normalizeKey(query)) && (
      /^(?:em|por|para|de|do|da|dos|das|com|sem)$/i.test(translation) ||
      /^(?:em|por|de)\s+(?:todo|toda|todos|todas|vário|vária|vários|várias)$/i.test(translation)
    )
    if (vagueFunctionGloss) {
      data = await callOpenRouter<LookupResponse>(
        [
          {
            role: "system",
            content: `Return ONLY JSON as {"translation":"...","patch":{"${normalizeKey(query)}":"..."}}. Translate the selected English function word for a Brazilian learner in the supplied sentence. The gloss must be reusable outside this exact noun phrase, contain 3 to 6 words, and explain the relation itself. Never answer only "por", "em", "de", "em várias", "em todas as", or another agreement-bound fragment.`,
          },
          {
            role: "user",
            content: JSON.stringify({ query, context: trimmedContext }),
          },
        ],
        model,
        { temperature: 0.1 },
      )
      translation = (data.translation || "").trim()
    }
    const rawPatch = data.patch || {}
    const patch: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawPatch)) {
      const nk = normalizeKey(k)
      if (nk && typeof v === "string" && v.trim()) {
        patch[nk] = v.trim()
      }
    }
    // Guarantee the snippet itself is in the patch — but only for short
    // snippets. For passages we deliberately do not cache the paragraph.
    if (!isPassage) {
      const qKey = normalizeKey(query)
      if (qKey && patch[qKey]) {
        // Keep the visible result and its exact contextual cache entry equal.
        // Small models can return a vague top-level gloss but a better patch.
        translation = patch[qKey]
      } else if (qKey && translation) {
        patch[qKey] = translation
      }
    }

    if (!translation) {
      return NextResponse.json(
        { error: "empty translation from model" },
        { status: 502 }
      )
    }

    return NextResponse.json({ translation, patch })
  } catch (err) {
    return safeApiError(err, "Erro ao traduzir trecho")
  }
}
