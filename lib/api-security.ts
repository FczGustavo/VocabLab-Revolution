import { NextResponse } from "next/server"

type RateLimitState = {
  count: number
  resetAt: number
}

type ApiGuardOptions = {
  limit?: number
  windowMs?: number
}

const globalRateLimits = globalThis as typeof globalThis & {
  __vocabLabRateLimits?: Map<string, RateLimitState>
}

const rateLimits = globalRateLimits.__vocabLabRateLimits ??= new Map<string, RateLimitState>()

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown"
  )
}

function allowedOrigins(request: Request) {
  const origins = new Set<string>()
  try {
    origins.add(new URL(request.url).origin)
  } catch {
    // A malformed request URL will not receive an implicit origin allowance.
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) {
    try {
      origins.add(new URL(configured).origin)
    } catch {
      // Reject origins when deployment configuration is malformed.
    }
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000")
    origins.add("http://127.0.0.1:3000")
  }
  return origins
}

export function guardApiRequest(
  request: Request,
  scope: string,
  options: ApiGuardOptions = {},
): NextResponse | null {
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > 10_000_000) {
    return NextResponse.json({ error: "Payload muito grande." }, { status: 413 })
  }

  const origin = request.headers.get("origin")
  if (origin && !allowedOrigins(request).has(origin)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 })
  }

  const now = Date.now()
  const windowMs = options.windowMs ?? 60_000
  const limit = options.limit ?? 30
  const key = `${scope}:${requestIp(request)}`
  const current = rateLimits.get(key)

  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs })
  } else if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    return NextResponse.json(
      { error: "Muitas solicitações. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    )
  } else {
    current.count += 1
  }

  if (rateLimits.size > 5_000) {
    for (const [entryKey, state] of rateLimits) {
      if (state.resetAt <= now) rateLimits.delete(entryKey)
    }
    while (rateLimits.size > 5_000) {
      const oldestKey = rateLimits.keys().next().value
      if (typeof oldestKey !== "string") break
      rateLimits.delete(oldestKey)
    }
  }

  return null
}

export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes = 1_000_000,
): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiInputError("Payload muito grande.", 413)
  }

  const raw = await request.text()
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new ApiInputError("Payload muito grande.", 413)
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new ApiInputError("JSON inválido.", 400)
  }
}

export class ApiInputError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function safeApiError(error: unknown, fallback: string) {
  if (error instanceof ApiInputError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const requestId = crypto.randomUUID()
  console.error(`[api][${requestId}]`, error)
  const providerMessage = error instanceof Error ? error.message : ""
  const providerCode = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : ""
  if (
    providerCode === "PGRST205"
    || /could not find the table .* in the schema cache/i.test(providerMessage)
  ) {
    return NextResponse.json(
      {
        error: "O banco de sincronização ainda não está completo. Aplique as migrações do Supabase e tente novamente.",
        code: "SYNC_SCHEMA_MISSING",
        requestId,
      },
      { status: 503 },
    )
  }
  if (/key limit exceeded|insufficient credits|credit balance|quota exceeded/i.test(providerMessage)) {
    return NextResponse.json(
      {
        error: "O limite de uso da chave de IA foi atingido. Ajuste o limite ou os créditos no OpenRouter.",
        code: "AI_PROVIDER_BUDGET_EXCEEDED",
        requestId,
      },
      { status: 402 },
    )
  }
  return NextResponse.json(
    {
      error: fallback,
      requestId,
      ...(process.env.NODE_ENV !== "production" && error instanceof Error
        ? { debug: error.message }
        : {}),
    },
    { status: 500 },
  )
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 30_000,
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return fetch(input, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal,
  })
}

const BUILTIN_ALLOWED_MODELS = [
  "openai/gpt-5.4-nano",
  "x-ai/grok-4.1-fast",
  "deepseek/deepseek-v4-flash",
  "minimax/minimax-m3:nitro",
]

export function resolveAllowedAiModel(candidate: unknown, fallback: string) {
  if (typeof candidate !== "string" || !candidate.trim()) return fallback

  const configuredModels = Object.entries(process.env)
    .filter(([key]) => key.endsWith("_AI_MODEL") || key.endsWith("_FALLBACK_MODEL"))
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value))
  const allowed = new Set([...BUILTIN_ALLOWED_MODELS, ...configuredModels, fallback])

  return allowed.has(candidate) ? candidate : fallback
}
