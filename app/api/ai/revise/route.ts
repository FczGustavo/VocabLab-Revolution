import { NextResponse } from "next/server"
import { reviseFlashcardByTranslation, DEFAULT_AI_MODEL } from "@/lib/openai"
import { guardApiRequest, readJsonWithLimit, resolveAllowedAiModel, safeApiError } from "@/lib/api-security"

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:revise", { limit: 30 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, any>>(req, 200_000)
    const model = resolveAllowedAiModel(body?.model, DEFAULT_AI_MODEL)
    const input = body?.input

    if (!input?.word || !input?.partOfSpeech || !input?.translation) {
      return NextResponse.json({ error: "input.word, input.partOfSpeech and input.translation are required" }, { status: 400 })
    }

    const data = await reviseFlashcardByTranslation(input, model)
    return NextResponse.json(data)
  } catch (err) {
    return safeApiError(err, "Erro ao revisar flashcard")
  }
}
