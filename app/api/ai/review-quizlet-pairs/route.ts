import { NextResponse } from "next/server"
import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"
import { openRouterReasoning } from "@/lib/openrouter-config"

import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const QUIZLET_IMPORT_REVIEW_AI_MODEL =
  process.env.QUIZLET_IMPORT_REVIEW_AI_MODEL ??
  process.env.LEXICOGRAPHER_REVIEW_AI_MODEL ??
  "ibm-granite/granite-4.1-8b"

type ImportPair = { word: string; translation: string }
type ReviewVerdict = "accepted" | "corrected" | "unverified"

function parseJsonContent<T>(raw: string): T {
  const text = raw.replace(/^\uFEFF/, "").trim()
  try {
    return JSON.parse(text) as T
  } catch {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T
    throw new Error("Pair review response was not valid JSON")
  }
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:review-quizlet", { limit: 10 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<{ entries?: unknown }>(req, 300_000)
    if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 60) {
      return NextResponse.json({ error: "Send between 1 and 60 vocabulary pairs." }, { status: 400 })
    }

    const entries: ImportPair[] = body.entries
      .map((entry) => {
        const value = entry as { word?: unknown; translation?: unknown }
        return {
          word: typeof value.word === "string" ? value.word.trim().replace(/\s+/g, " ") : "",
          translation: typeof value.translation === "string" ? value.translation.trim().replace(/\s+/g, " ") : "",
        }
      })
      .filter((entry) => entry.word && entry.translation)

    if (entries.length === 0) return NextResponse.json({ reviews: [] })

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured on the server.")

    const activeModel = resolveGraniteModel(QUIZLET_IMPORT_REVIEW_AI_MODEL)
    const startedAt = Date.now()
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-OpenRouter-Title": "VocabLab - Quizlet Translation Review",
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: activeModel,
        temperature: 0,
        max_tokens: 1_800,
        provider: { sort: "throughput" },
        ...openRouterReasoning(activeModel),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a strict English-to-Brazilian-Portuguese learner-dictionary editor. Review each imported pair independently. Return ONLY JSON:
{"reviews":[{"index":0,"verdict":"accepted|corrected","translation":"normalized Portuguese translation","reason":"short Portuguese reason"}]}

Rules:
- "accepted" only when the imported translation is a real, accurate sense of the exact English entry, with a compatible part of speech. Return a polished normalized version in translation.
- "corrected" when it is clearly unrelated, false, a wrong part of speech, a mistranslation, or an implausible OCR error. Replace it with the most common accurate learner translation and explain briefly in Portuguese.
- Do not preserve an incorrect translation just because it could be loosely associated with another word.
- A valid less-common sense is accepted only when the source phrase clearly indicates it; otherwise use the common learner sense.
- Use at most two Portuguese equivalents separated by " / ".
- Return one review for every supplied index, in the same order.`,
          },
          {
            role: "user",
            content: JSON.stringify({ entries: entries.map((entry, index) => ({ index, ...entry })) }),
          },
        ],
      }),
    })

    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`)
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    recordGranitePerformance(QUIZLET_IMPORT_REVIEW_AI_MODEL, Date.now() - startedAt, data)
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error("Pair review response was empty")

    const parsed = parseJsonContent<{ reviews?: unknown[] }>(content)
    const byIndex = new Map<number, { verdict: ReviewVerdict; translation: string; reason: string }>()
    for (const raw of parsed.reviews ?? []) {
      const review = raw as { index?: unknown; verdict?: unknown; translation?: unknown; reason?: unknown }
      const index = typeof review.index === "number" ? review.index : -1
      if (index < 0 || index >= entries.length) continue
      byIndex.set(index, {
        verdict: review.verdict === "corrected" ? "corrected" : "accepted",
        translation: typeof review.translation === "string" && review.translation.trim()
          ? review.translation.trim().replace(/\s+/g, " ")
          : entries[index].translation,
        reason: typeof review.reason === "string" ? review.reason.trim().replace(/\s+/g, " ") : "",
      })
    }

    return NextResponse.json({
      reviews: entries.map((entry, index) => byIndex.get(index) ?? {
        verdict: "unverified" as const,
        translation: entry.translation,
        reason: "A revisão automática não retornou um resultado para esta linha.",
      }),
    })
  } catch (error) {
    return safeApiError(error, "Could not review imported translations.")
  }
}
