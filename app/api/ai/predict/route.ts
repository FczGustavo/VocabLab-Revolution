import { NextResponse } from "next/server"

import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"
import { guardApiRequest, readJsonWithLimit } from "@/lib/api-security"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
// Keep autocomplete independently configurable, like the other AI pipelines.
const PREDICT_MODEL =
  process.env.PREDICT_AI_MODEL ??
  "ibm-granite/granite-4.1-8b"

const predictionCache = new Map<string, { expiresAt: number; suggestions: string[] }>()
const CACHE_TTL_MS = 5 * 60_000
const PREDICTION_CACHE_LIMIT = 500
const PREDICTION_CACHE_VERSION = "en-v3"

function cachePrediction(key: string, suggestions: string[]) {
  predictionCache.delete(key)
  predictionCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, suggestions })
  while (predictionCache.size > PREDICTION_CACHE_LIMIT) {
    const oldest = predictionCache.keys().next().value
    if (typeof oldest !== "string") break
    predictionCache.delete(oldest)
  }
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:predict", { limit: 60 })
  if (blocked) return blocked
  try {
    const { prefix } = await readJsonWithLimit<{ prefix?: string }>(req, 5_000)
    const normalizedPrefix = prefix?.trim().toLowerCase().replace(/\s+/g, " ") ?? ""
    if (normalizedPrefix.length < 2 || normalizedPrefix.length > 60 || !/^[a-z][a-z' -]*$/.test(normalizedPrefix)) {
      return NextResponse.json({ suggestions: [] })
    }

    const cacheKey = `${PREDICTION_CACHE_VERSION}:${normalizedPrefix}`
    const cached = predictionCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      predictionCache.delete(cacheKey)
      predictionCache.set(cacheKey, cached)
      return NextResponse.json({ suggestions: cached.suggestions })
    }
    if (cached) predictionCache.delete(cacheKey)

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ suggestions: [] })
    }

    const activeModel = resolveGraniteModel(PREDICT_MODEL)
    const startedAt = Date.now()
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-OpenRouter-Title": "VocabLab Predict",
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          {
            role: "system",
            content: `English-only spelling autocomplete. Return only {"s":[...]}, with at most 3 common modern English entries beginning exactly with the prefix, ranked by usefulness. Exclude the prefix itself. One-word input permits single words only; input containing spaces may permit common phrasal verbs or idioms. Never translate or output Portuguese/Spanish. Return [] when uncertain. Example: "faz" may yield "faze", never "fazer" or "fazenda".`
          },
          {
            role: "user",
            content: `Prefix: ${JSON.stringify(normalizedPrefix)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 40,
        provider: { sort: "throughput" },
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(6_000),
    })

    if (!res.ok) {
      return NextResponse.json({ suggestions: [] })
    }

    const data = await res.json()
    recordGranitePerformance(PREDICT_MODEL, Date.now() - startedAt, data)
    const content = data?.choices?.[0]?.message?.content ?? "[]"

    let parsed: string[] = []
    try {
      const outer = JSON.parse(content)
      // The model may return {"words": [...]} or just [...]
      if (Array.isArray(outer)) {
        parsed = outer
      } else if (outer.s && Array.isArray(outer.s)) {
        parsed = outer.s
      } else if (outer.suggestions && Array.isArray(outer.suggestions)) {
        parsed = outer.suggestions
      } else {
        // Try to find any array in the object
        for (const val of Object.values(outer)) {
          if (Array.isArray(val)) { parsed = val as string[]; break }
        }
      }
    } catch {
      // fallback: try to extract words from text
      const matches = content.match(/"[a-z]+"/gi)
      if (matches) parsed = matches.map((m: string) => m.replace(/"/g, ""))
    }

    const suggestions = parsed
      .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w !== normalizedPrefix && w.startsWith(normalizedPrefix))
      .filter((w) => normalizedPrefix.includes(" ") ? /^[a-z][a-z' -]*$/.test(w) : /^[a-z][a-z'-]*$/.test(w))
      .filter((w, index, values) => values.indexOf(w) === index)
      .slice(0, 3)

    cachePrediction(cacheKey, suggestions)
    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error("[api/ai/predict]", err)
    return NextResponse.json({ suggestions: [] })
  }
}
