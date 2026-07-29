import { NextResponse } from "next/server"

import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const QUIZLET_IMPORT_OCR_MODEL =
  process.env.QUIZLET_IMPORT_OCR_MODEL ?? "google/gemini-3.1-flash-lite"

interface QuizletEntry {
  word: string
  translation: string
}

function parseJsonContent<T>(raw: string): T {
  const text = raw.replace(/^\uFEFF/, "").trim()
  try {
    return JSON.parse(text) as T
  } catch {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T
    throw new Error("OCR response was not valid JSON")
  }
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:import-quizlet", { limit: 10 })
  if (blocked) return blocked
  try {
    const { imageData } = await readJsonWithLimit<{ imageData?: unknown }>(req, 8_200_000)
    if (typeof imageData !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/i.test(imageData)) {
      return NextResponse.json({ error: "A rendered PDF page image is required." }, { status: 400 })
    }
    if (imageData.length > 8_000_000) {
      return NextResponse.json({ error: "PDF page image is too large." }, { status: 413 })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured on the server.")

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-OpenRouter-Title": "VocabLab - Quizlet PDF Import",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: QUIZLET_IMPORT_OCR_MODEL,
        temperature: 0,
        max_tokens: 2_400,
        provider: { sort: "throughput" },
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You extract Quizlet export rows for an English-to-Brazilian-Portuguese vocabulary importer. Read the supplied page image and return ONLY JSON:
{"entries":[{"word":"English term exactly as printed","translation":"Portuguese translation exactly as printed"}]}

Rules:
- Extract every vocabulary row in visual order.
- A row normally has an English term on the left and its Portuguese translation on the right.
- Preserve the Portuguese translation; NEVER translate, improve, shorten, or reinterpret it.
- Preserve phrasal-verb particles, parentheses, slashes, and accents.
- Ignore titles, URLs, Quizlet branding, section headings, row numbers, page numbers, and decorative text.
- Do not invent a pair when either side is missing or uncertain.
- Return an empty entries array if there are no usable rows.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the vocabulary pairs from this Quizlet PDF page." },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter returned ${response.status}`)
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error("OCR response was empty")

    const parsed = parseJsonContent<{ entries?: unknown[] }>(content)
    const entries: QuizletEntry[] = (parsed.entries ?? [])
      .map((entry) => {
        const value = entry as { word?: unknown; translation?: unknown }
        return {
          word: typeof value.word === "string" ? value.word.trim().replace(/\s+/g, " ") : "",
          translation: typeof value.translation === "string" ? value.translation.trim().replace(/\s+/g, " ") : "",
        }
      })
      .filter((entry) => entry.word.length > 0 && entry.translation.length > 0)

    return NextResponse.json({ entries })
  } catch (error) {
    return safeApiError(error, "Could not read the Quizlet PDF page.")
  }
}
