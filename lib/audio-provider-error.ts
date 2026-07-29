export interface AudioProviderError {
  code: "AUDIO_CREDIT_REQUIRED" | "AUDIO_PROVIDER_ERROR"
  message: string
  status: number
}

function extractProviderMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof parsed.error === "string") return parsed.error
    if (parsed.error?.message) return parsed.error.message
    if (parsed.message) return parsed.message
  } catch {
    // Some gateways return plain text or an HTML error page.
  }
  return body.trim().slice(0, 300)
}

export function normalizeAudioProviderError(body: string, providerStatus: number): AudioProviderError {
  const providerMessage = extractProviderMessage(body)
  const creditRequired = /balance|credit|credits|payment|required.*\$|insufficient funds/i.test(providerMessage)

  if (creditRequired) {
    return {
      code: "AUDIO_CREDIT_REQUIRED",
      message: "GPT Audio indisponível: o OpenRouter exige pelo menos US$ 0,50 de saldo para gerar áudio.",
      status: 402,
    }
  }

  return {
    code: "AUDIO_PROVIDER_ERROR",
    message: providerMessage || `O provedor de áudio respondeu com erro ${providerStatus}.`,
    status: 502,
  }
}
