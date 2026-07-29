import { NextResponse } from "next/server"
import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import { normalizeAudioProviderError } from "@/lib/audio-provider-error"

export const runtime = "nodejs"

const API_URL = "https://openrouter.ai/api/v1/chat/completions"
const MODEL = process.env.READLAB_AUDIO_AI_MODEL ?? "openai/gpt-audio-mini"
const ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"])

function pcmToWav(pcmBase64: string) {
  const pcm = Buffer.from(pcmBase64, "base64")
  const header = Buffer.alloc(44)
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8)
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm]).toString("base64")
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "readlab:audio", { limit: 20 })
  if (blocked) return blocked
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY não configurada." }, { status: 500 })
    const body = await readJsonWithLimit<Record<string, unknown>>(request, 20_000)
    const text = String(body?.text ?? "").trim()
    const requestedVoice = String(body?.voice ?? "alloy")
    const voice = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : "alloy"
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 })
    if (text.length > 6000) return NextResponse.json({ error: "O trecho pode ter no máximo 6000 caracteres." }, { status: 400 })

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-OpenRouter-Title": "ReadLab narration",
        Accept: "text/event-stream",
      },
      signal: AbortSignal.timeout(35_000),
      body: JSON.stringify({
        model: MODEL,
        modalities: ["text", "audio"],
        audio: { voice, format: "pcm16" },
        stream: true,
        messages: [
          {
            role: "system",
            content: "You are the ReadLab English reading voice. Read the supplied English selection exactly as written, without introductions, explanations, translations, corrections, repetitions, or added words. For one word, pronounce it once and clearly. For a phrase or passage, use natural American-English pacing, phrasing, pauses, and intonation. Output audio only.",
          },
          { role: "user", content: `<READLAB_SELECTION>${text}</READLAB_SELECTION>` },
        ],
      }),
    })
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "")
      const failure = normalizeAudioProviderError(detail, response.status)
      return NextResponse.json({ error: failure.message, code: failure.code }, { status: failure.status })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let audio = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf("\n")
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith("data:") && line.slice(5).trim() !== "[DONE]") {
          try {
            const event = JSON.parse(line.slice(5).trim())
            for (const choice of event?.choices ?? []) {
              if (choice?.delta?.audio?.data) audio += choice.delta.audio.data
              if (choice?.message?.audio?.data) audio = choice.message.audio.data
            }
          } catch {}
        }
        newline = buffer.indexOf("\n")
      }
    }
    if (!audio || Buffer.from(audio, "base64").length < 1000) {
      return NextResponse.json({ error: "A IA retornou um áudio vazio." }, { status: 502 })
    }
    return NextResponse.json({ data: pcmToWav(audio), mimeType: "audio/wav", model: MODEL })
  } catch (error) {
    return safeApiError(error, "Erro ao gerar áudio.")
  }
}
