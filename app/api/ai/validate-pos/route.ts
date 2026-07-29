import { NextResponse } from "next/server"
import { validateWordPartOfSpeech, DEFAULT_AI_MODEL } from "@/lib/openai"
import { guardApiRequest, readJsonWithLimit, resolveAllowedAiModel, safeApiError } from "@/lib/api-security"

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:validate-pos", { limit: 40 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 50_000)
    const word = typeof body.word === "string" ? body.word : ""
    const partOfSpeech = typeof body.partOfSpeech === "string" ? body.partOfSpeech : ""
    const translation = typeof body.translation === "string" ? body.translation : ""
    const grammaticalForm = typeof body.grammaticalForm === "string" ? body.grammaticalForm : ""
    const model = resolveAllowedAiModel(body?.model, DEFAULT_AI_MODEL)

    if (!word.trim() || !partOfSpeech.trim()) {
      return NextResponse.json({ error: "word and partOfSpeech are required" }, { status: 400 })
    }

    const result = await validateWordPartOfSpeech({
      word: word.trim(),
      partOfSpeech: partOfSpeech.trim(),
      translation: translation.trim(),
      grammaticalForm: grammaticalForm.trim() || undefined,
    }, model)

    return NextResponse.json(result)
  } catch (err) {
    return safeApiError(err, "Erro ao validar classe gramatical")
  }
}
