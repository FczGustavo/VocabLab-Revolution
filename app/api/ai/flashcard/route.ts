import { NextResponse } from "next/server"
import { generateFlashcardData, DEFAULT_AI_MODEL } from "@/lib/openai"
import type { GenerateFlashcardOptions } from "@/lib/openai"
import { guardApiRequest, readJsonWithLimit, resolveAllowedAiModel, safeApiError } from "@/lib/api-security"

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:flashcard", { limit: 20 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 100_000)
    const word = typeof body.word === "string" ? body.word : ""
    const model = resolveAllowedAiModel(body?.model, DEFAULT_AI_MODEL)
    const options: GenerateFlashcardOptions =
      body.options && typeof body.options === "object"
        ? body.options as GenerateFlashcardOptions
        : {}

    if (!word.trim()) {
      return NextResponse.json({ error: "word is required" }, { status: 400 })
    }

    const data = await generateFlashcardData(word.trim(), model, options)
    return NextResponse.json(data)
  } catch (err) {
    return safeApiError(err, "Erro ao gerar flashcard")
  }
}
