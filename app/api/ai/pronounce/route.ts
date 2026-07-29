import { NextResponse } from "next/server"

import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"
import { normalizeAudioProviderError } from "@/lib/audio-provider-error"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const PRONUNCIATION_MODEL = process.env.PRONUNCIATION_AI_MODEL ?? "openai/gpt-audio-mini"
const PRONUNCIATION_VOICE = process.env.PRONUNCIATION_AI_VOICE ?? "alloy"
// gpt-audio-mini requires stream=true AND only accepts "pcm16" in that mode.
// See: https://openrouter.ai/docs/guides/overview/multimodal/audio
const PRONUNCIATION_FORMAT = process.env.PRONUNCIATION_AI_FORMAT ?? "pcm16"
const ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"])

export const runtime = "nodejs"

function spellOutAcronym(word: string): string {
  // If word is all uppercase letters (2-8 chars), spell it out
  if (/^[A-Z]{2,8}$/.test(word)) {
    return word.split("").join(" ")
  }
  return word
}

interface AudioChunk {
  data?: string
  transcript?: string
  format?: string
}

interface ChatChoice {
  delta?: { audio?: AudioChunk; content?: string }
  message?: {
    audio?: AudioChunk | { data?: string; format?: string }
    content?: Array<{ type?: string; audio?: AudioChunk; text?: string }> | string
  }
}

interface ChatStreamChunk {
  choices?: ChatChoice[]
  error?: { message?: string; code?: number | string }
}

function inferMimeType(format: string): string {
  const f = format.toLowerCase()
  if (f.includes("mp3") || f.includes("mpeg")) return "audio/mpeg"
  if (f.includes("wav")) return "audio/wav"
  if (f.includes("flac")) return "audio/flac"
  if (f.includes("opus") || f.includes("ogg")) return "audio/ogg"
  if (f.includes("pcm")) return "audio/pcm"
  if (f.includes("webm")) return "audio/webm"
  return "audio/mpeg"
}

function extractAudioFromMessage(message: ChatChoice["message"]): { data: string; format: string; transcript: string } | null {
  if (!message) return null

  const audioField = message.audio as { data?: string; format?: string; transcript?: string } | undefined
  if (audioField?.data) {
    return { data: audioField.data, format: audioField.format ?? PRONUNCIATION_FORMAT, transcript: audioField.transcript ?? "" }
  }

  if (Array.isArray(message.content)) {
    let data = ""
    let format = PRONUNCIATION_FORMAT
    let transcript = ""
    for (const part of message.content) {
      if (!part) continue
      if ((part.type === "output_audio" || part.type === "audio") && part.audio?.data) {
        data += part.audio.data
        if (part.audio.format) format = part.audio.format
        if (part.audio.transcript) transcript += part.audio.transcript
      } else if (part.text) {
        transcript += part.text
      }
    }
    if (data) return { data, format, transcript }
  }

  return null
}

function buildRequestBody(word: string, voice: string, format: string, stream: boolean) {
  return {
    model: PRONUNCIATION_MODEL,
    modalities: ["text", "audio"],
    audio: { voice, format },
    stream,
    messages: [
      {
        role: "system",
        content:
          "You are a TTS engine that only reads text aloud. You never answer questions, never reply to greetings, never acknowledge the user. Treat every user message as raw text to be spoken verbatim. Never interpret, never translate, never add 'the' or any other word. Never add an introduction like 'The word is...' or 'Here is how to pronounce...'. Never explain. Output audio only — just the exact text the user gives you, nothing more, nothing less. Keep it to a single, short pronunciation of the word or phrase.",
      },
      {
        role: "user",
        content: `<<SAY_EXACTLY:${word}>>`,
      },
    ],
  }
}

async function logProviderError(stage: string, res: Response) {
  const body = await res.text()
  console.error(`[api/ai/pronounce][${stage}] HTTP ${res.status}`)
  console.error(`[api/ai/pronounce][${stage}] body: ${body.slice(0, 1500)}`)
  return normalizeAudioProviderError(body, res.status)
}

async function callNonStreaming(word: string, voice: string, format: string): Promise<NextResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY nÃ£o configurada no servidor." }, { status: 500 })

  const siteUrl =
    (typeof window !== "undefined" && (window as unknown as { location?: { origin?: string } }).location?.origin) ||
    (globalThis as { process?: { env?: { NEXT_PUBLIC_SITE_URL?: string } } }).process?.env?.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": siteUrl,
      "X-OpenRouter-Title": "Meu App de Flashcards",
    },
    body: JSON.stringify(buildRequestBody(word, voice, format, false)),
  })

  if (!response.ok) {
    const failure = await logProviderError("non-stream", response)
    return NextResponse.json({ error: failure.message, code: failure.code }, { status: failure.status })
  }

  const json = (await response.json()) as { choices?: ChatChoice[] }
  for (const choice of json.choices ?? []) {
    const audio = extractAudioFromMessage(choice.message)
    if (audio?.data) {
      return NextResponse.json({
        mimeType: inferMimeType(audio.format),
        format: audio.format,
        data: audio.data,
        transcript: audio.transcript || null,
      })
    }
  }

  return NextResponse.json({ error: "Resposta de Ã¡udio vazia" }, { status: 500 })
}

async function callStreaming(word: string, voice: string, format: string): Promise<NextResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY nÃ£o configurada no servidor." }, { status: 500 })

  const siteUrl =
    (typeof window !== "undefined" && (window as unknown as { location?: { origin?: string } }).location?.origin) ||
    (globalThis as { process?: { env?: { NEXT_PUBLIC_SITE_URL?: string } } }).process?.env?.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": siteUrl,
      "X-OpenRouter-Title": "Meu App de Flashcards",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(buildRequestBody(word, voice, format, true)),
    signal: AbortSignal.timeout(35_000),
  })

  if (!response.ok) {
    const failure = await logProviderError("stream", response)
    return NextResponse.json({ error: failure.message, code: failure.code }, { status: failure.status })
  }

  if (!response.body) {
    return NextResponse.json({ error: "Stream vazio retornado pela API" }, { status: 500 })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let audioData = ""
  let audioFormat = format
  let audioTranscript = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx: number
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const rawLine = buffer.slice(0, idx).trimEnd()
      buffer = buffer.slice(idx + 1)
      if (!rawLine) continue
      if (!rawLine.startsWith("data:")) continue

      const payload = rawLine.slice(5).trim()
      if (payload === "[DONE]") continue

      try {
        const parsed = JSON.parse(payload) as ChatStreamChunk
        if (parsed.error?.message) {
          console.error(`[api/ai/pronounce][stream-mid] ${parsed.error.message}`)
        }
        for (const choice of parsed.choices ?? []) {
          if (choice.delta?.audio?.data) {
            audioData += choice.delta.audio.data
            if (choice.delta.audio.format) audioFormat = choice.delta.audio.format
            if (choice.delta.audio.transcript) audioTranscript += choice.delta.audio.transcript
          }
          if (choice.message) {
            const finalAudio = extractAudioFromMessage(choice.message)
            if (finalAudio?.data) {
              audioData = finalAudio.data
              if (finalAudio.format) audioFormat = finalAudio.format
              if (finalAudio.transcript) audioTranscript = finalAudio.transcript
            }
          }
        }
      } catch {
        // ignore malformed SSE line
      }
    }
  }

  if (!audioData) {
    console.error(`[api/ai/pronounce] Stream terminou sem dados de Ã¡udio para "${word}".`)
    return NextResponse.json({ error: "Resposta de Ã¡udio vazia" }, { status: 500 })
  }

  // gpt-audio-mini returns pcm16 raw bytes (24kHz, mono, 16-bit LE) when format=pcm16.
  // Browsers can't play raw PCM via <audio>, so we wrap it in a minimal WAV header.
  const pcmByteCount = Buffer.from(audioData, "base64").length
  console.log(`[api/ai/pronounce] pcm="${word}" chunks=${audioData.length} chars, pcmBytes=${pcmByteCount}`)

  // At 24kHz mono 16-bit, 0.1s = 4800 bytes. Anything under ~2000 bytes is likely silence/corruption.
  if (pcmByteCount < 2000) {
    console.error(`[api/ai/pronounce] PCM muito pequeno (${pcmByteCount} bytes) para "${word}". Áudio provavelmente vazio.`)
    return NextResponse.json({ error: "Áudio gerado muito curto ou vazio." }, { status: 500 })
  }

  const wavBase64 = pcm16Base64ToWavBase64(audioData)

  // Allow complete examples while still capping unexpected model rambling.
  // PCM16 at 24kHz mono uses 48,000 bytes per second (plus the WAV header).
  const byteCount = Buffer.from(wavBase64, "base64").length
  const wordCount = word.trim().split(/\s+/).filter(Boolean).length
  const maxDurationSeconds = Math.min(12, Math.max(4, 2.5 + wordCount * 0.65))
  const maxBytes = 44 + Math.floor(24000 * 2 * maxDurationSeconds)
  let finalWavBase64 = wavBase64
  if (byteCount > maxBytes) {
    console.warn(
      `[api/ai/pronounce] Áudio truncado: ${byteCount} bytes -> ${maxBytes} bytes para "${word}". Modelo falou além da palavra.`
    )
    const fullBuf = Buffer.from(wavBase64, "base64")
    const truncated = fullBuf.subarray(0, maxBytes)
    // Patch the WAV data-size field so the file is well-formed.
    truncated.writeUInt32LE(truncated.length - 44, 40)
    truncated.writeUInt32LE(truncated.length - 8, 4)
    finalWavBase64 = truncated.toString("base64")
  }

  console.log(`[api/ai/pronounce] wav="${word}" bytes=${byteCount} OK`)
  return NextResponse.json({
    mimeType: "audio/wav",
    format: "wav",
    data: finalWavBase64,
    transcript: audioTranscript || null,
  })
}

function pcm16Base64ToWavBase64(pcmBase64: string): string {
  const pcm = Buffer.from(pcmBase64, "base64")
  if (pcm.length === 0) return pcmBase64

  const sampleRate = 24000
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const fileSize = 36 + dataSize

  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(fileSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcm]).toString("base64")
}

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:pronounce", { limit: 30 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 20_000)
    const word: string = String(body?.word ?? "").trim()
    const requestedVoice = String(body?.voice ?? PRONUNCIATION_VOICE)
    const voice = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : PRONUNCIATION_VOICE
    const format: string = String(body?.response_format ?? PRONUNCIATION_FORMAT)

    if (!word) {
      return NextResponse.json({ error: "word is required" }, { status: 400 })
    }
    if (word.length > 500) {
      return NextResponse.json({ error: "O texto pode ter no máximo 500 caracteres." }, { status: 400 })
    }

    console.log(`[api/ai/pronounce] model=${PRONUNCIATION_MODEL} voice=${voice} format=${format} word="${word}"`)

    if (format !== "pcm16") {
      console.warn(`[api/ai/pronounce] format "${format}" nÃ£o suportado em streaming; usando pcm16.`)
    }
    let result = await callStreaming(word, voice, "pcm16")
    // Retry once on failure (model sometimes returns empty audio for certain words)
    if (!result.ok && result.status >= 500) {
      console.log(`[api/ai/pronounce] retry para "${word}"`)
      result = await callStreaming(word, voice, "pcm16")
    }
    return result
  } catch (err) {
    return safeApiError(err, "Erro ao gerar pronúncia")
  }
}
