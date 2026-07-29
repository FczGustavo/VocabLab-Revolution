import { NextResponse } from "next/server"
import { graniteFailoverStatus, recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"
import { guardApiRequest } from "@/lib/api-security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const OPENROUTER_URL = "https://openrouter.ai/api/v1"
const defaultModel = process.env.DEFAULT_AI_MODEL ?? "openai/gpt-5.4-nano"

type Service = { id: string; area: string; name: string; model: string; kind: "text" | "audio" }

function configuredServices(): Service[] {
  const readText = process.env.READLAB_AI_MODEL ?? "ibm-granite/granite-4.1-8b"
  const regency = process.env.REGENCY_AI_MODEL ?? defaultModel
  const grammar = process.env.GRAMMAR_AI_MODEL ?? defaultModel
  return [
    { id: "vocab-generator", area: "VocabLab", name: "Geração central", model: defaultModel, kind: "text" },
    { id: "vocab-review", area: "VocabLab", name: "Revisão lexicográfica", model: process.env.LEXICOGRAPHER_REVIEW_AI_MODEL ?? defaultModel, kind: "text" },
    { id: "vocab-predict", area: "VocabLab", name: "Previsão de palavras", model: process.env.PREDICT_AI_MODEL ?? defaultModel, kind: "text" },
    { id: "vocab-audio", area: "VocabLab", name: "Pronúncia", model: process.env.PRONUNCIATION_AI_MODEL ?? "openai/gpt-audio-mini", kind: "audio" },
    { id: "regency-generator", area: "RegencyLab", name: "Geração de famílias", model: regency, kind: "text" },
    { id: "regency-review", area: "RegencyLab", name: "Revisor didático", model: process.env.REGENCY_REVIEW_AI_MODEL ?? regency, kind: "text" },
    { id: "read-process", area: "ReadLab", name: "Processamento de texto", model: readText, kind: "text" },
    { id: "read-lookup", area: "ReadLab", name: "Tradução contextual", model: process.env.READLAB_LOOKUP_AI_MODEL ?? readText, kind: "text" },
    { id: "read-ocr", area: "ReadLab", name: "Leitura de imagem", model: process.env.READLAB_OCR_MODEL ?? defaultModel, kind: "text" },
    { id: "read-audio", area: "ReadLab", name: "Narração", model: process.env.READLAB_AUDIO_AI_MODEL ?? "openai/gpt-audio-mini", kind: "audio" },
    { id: "grammar-generator", area: "QuestionLab", name: "Geração de questões", model: grammar, kind: "text" },
    { id: "grammar-review", area: "QuestionLab", name: "Revisor", model: process.env.REVISOR_AI_MODEL ?? grammar, kind: "text" },
    { id: "derivations", area: "Sistema", name: "Validação de derivações", model: process.env.VALIDATE_DERIVATIONS_AI_MODEL ?? defaultModel, kind: "text" },
    { id: "import-review", area: "Sistema", name: "Revisão de importações", model: process.env.QUIZLET_IMPORT_REVIEW_AI_MODEL ?? process.env.LEXICOGRAPHER_REVIEW_AI_MODEL ?? defaultModel, kind: "text" },
  ]
}

async function benchmarkModel(apiKey: string, model: string) {
  const started = Date.now()
  const activeModel = resolveGraniteModel(model)
  try {
    const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: activeModel,
        messages: [{ role: "user", content: "Reply with exactly: operational" }],
        max_tokens: 16,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    })
    const elapsedMs = Date.now() - started
    const json = await response.json().catch(() => ({}))
    recordGranitePerformance(model, elapsedMs, json)
    if (!response.ok) return { operational: false, latencyMs: elapsedMs, tokensPerSecond: null, outputTokens: null, error: json?.error?.message ?? `HTTP ${response.status}` }
    const outputTokens = Number(json?.usage?.completion_tokens ?? 0) || null
    return {
      operational: true,
      latencyMs: elapsedMs,
      outputTokens,
      tokensPerSecond: outputTokens ? Number((outputTokens / (elapsedMs / 1000)).toFixed(1)) : null,
      error: null,
    }
  } catch (error) {
    return { operational: false, latencyMs: Date.now() - started, tokensPerSecond: null, outputTokens: null, error: error instanceof Error ? error.message : "Falha no benchmark" }
  }
}

export async function GET(request: Request) {
  const runBenchmark = new URL(request.url).searchParams.get("benchmark") === "1"
  const blocked = guardApiRequest(
    request,
    runBenchmark ? "ai:status:benchmark" : "ai:status",
    { limit: runBenchmark ? 2 : 30 },
  )
  if (blocked) return blocked
  const apiKey = process.env.OPENROUTER_API_KEY
  const services = configuredServices()
  if (!apiKey) return NextResponse.json({ provider: { operational: false, latencyMs: null, error: "OPENROUTER_API_KEY não configurada" }, checkedAt: Date.now(), services: services.map((service) => ({ ...service, operational: false, latencyMs: null, tokensPerSecond: null, outputTokens: null, error: "Chave ausente" })) })

  const started = Date.now()
  try {
    const catalogResponse = await fetch(`${OPENROUTER_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000), cache: "no-store" })
    const providerLatency = Date.now() - started
    const catalog = await catalogResponse.json().catch(() => ({}))
    if (!catalogResponse.ok) throw new Error(catalog?.error?.message ?? `HTTP ${catalogResponse.status}`)
    const availableModels = new Set<string>((catalog?.data ?? []).map((item: { id?: string }) => item.id).filter(Boolean))
    const textModels = [...new Set(services.filter((service) => service.kind === "text" && availableModels.has(service.model)).map((service) => service.model))]
    const benchmarkEntries = runBenchmark ? await Promise.all(textModels.map(async (model) => [model, await benchmarkModel(apiKey, model)] as const)) : []
    const benchmarks = new Map(benchmarkEntries)
    return NextResponse.json({
      provider: { operational: true, latencyMs: providerLatency, error: null },
      checkedAt: Date.now(),
      benchmarked: runBenchmark,
      graniteFailover: graniteFailoverStatus(),
      services: services.map((service) => {
        const available = availableModels.has(service.model)
        const measured = benchmarks.get(service.model)
        return { ...service, operational: measured?.operational ?? available, latencyMs: measured?.latencyMs ?? providerLatency, tokensPerSecond: service.kind === "text" ? measured?.tokensPerSecond ?? null : null, outputTokens: measured?.outputTokens ?? null, error: measured?.error ?? (available ? null : "Modelo não encontrado no catálogo") }
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provedor indisponível"
    return NextResponse.json({ provider: { operational: false, latencyMs: Date.now() - started, error: message }, checkedAt: Date.now(), services: services.map((service) => ({ ...service, operational: false, latencyMs: null, tokensPerSecond: null, outputTokens: null, error: message })) })
  }
}
