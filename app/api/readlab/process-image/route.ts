import { NextResponse } from "next/server"
import { DEFAULT_AI_MODEL } from "@/lib/openai"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const READLAB_OCR_MODEL = process.env.READLAB_OCR_MODEL ?? DEFAULT_AI_MODEL

interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string
    }
  }[]
}

interface ReadLabOCRResponse {
  extractedText: string
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
    throw new Error("AI response was not valid JSON")
  }
}

async function callOpenRouter<T>(
  messages: OpenRouterMessage[],
  model: string,
  responseFormat?: { type: "json_object" },
  options?: { temperature?: number }
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured on the server.")
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      "HTTP-Referer":
        (typeof window !== "undefined" && window.location?.origin) ||
        ((globalThis as any).process?.env?.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
      "X-OpenRouter-Title": "ReadLab - OCR Image Processing",
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.1,
      provider: {
        sort: "throughput",
      },
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  })

  if (!response.ok) {
    const rawError = await response.text()
    let message = `OpenRouter API error (status ${response.status})`
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
  const content = data.choices[0].message.content
  if (!content) {
    throw new Error("Empty AI response")
  }
  return parseJsonContent<T>(content)
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "readlab:ocr", { limit: 10 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 8_500_000)
    const imageData = typeof body?.imageData === "string" ? body.imageData : ""

    if (!imageData) {
      return NextResponse.json({ error: "imageData is required" }, { status: 400 })
    }

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: `You are an OCR specialist. Extract ALL text from the provided image accurately.

For the given image, return ONLY valid JSON with this structure:
{
  "extractedText": "the complete text extracted from the image"
}

Rules:
- Extract ALL visible text, preserving the original structure and line breaks
- Maintain paragraph breaks with double newlines
- Preserve bullet points, numbered lists, and headings
- Do NOT add any commentary, interpretation, or translation
- Do NOT skip any text, even if it appears to be headers, footers, or captions
- If the image contains no readable text, return {"extractedText": ""}
- For handwritten text, do your best to decipher it accurately`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all text from this image:"
          },
          {
            type: "image_url",
            image_url: {
              url: imageData
            }
          }
        ]
      }
    ]

    const data = await callOpenRouter<ReadLabOCRResponse>(
      messages,
      READLAB_OCR_MODEL,
      { type: "json_object" },
      { temperature: 0.1 }
    )

    const extractedText = data.extractedText || ""

    return NextResponse.json({ extractedText })
  } catch (err) {
    return safeApiError(err, "Failed to process image")
  }
}
