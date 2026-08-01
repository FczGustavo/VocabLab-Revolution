import { afterEach, describe, expect, it } from "vitest"
import { openRouterReasoning } from "./openrouter-config"

const ORIGINAL_ENV = {
  enabled: process.env.OPENROUTER_REASONING_ENABLED,
  models: process.env.OPENROUTER_REASONING_MODELS,
  effort: process.env.OPENROUTER_REASONING_EFFORT,
  maxTokens: process.env.OPENROUTER_REASONING_MAX_TOKENS,
  exclude: process.env.OPENROUTER_REASONING_EXCLUDE,
}

afterEach(() => {
  const entries: Array<[string, string | undefined]> = [
    ["OPENROUTER_REASONING_ENABLED", ORIGINAL_ENV.enabled],
    ["OPENROUTER_REASONING_MODELS", ORIGINAL_ENV.models],
    ["OPENROUTER_REASONING_EFFORT", ORIGINAL_ENV.effort],
    ["OPENROUTER_REASONING_MAX_TOKENS", ORIGINAL_ENV.maxTokens],
    ["OPENROUTER_REASONING_EXCLUDE", ORIGINAL_ENV.exclude],
  ]
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("OpenRouter reasoning configuration", () => {
  it("enables configured DeepSeek reasoning without exposing the trace", () => {
    process.env.OPENROUTER_REASONING_ENABLED = "true"
    process.env.OPENROUTER_REASONING_MODELS = "deepseek/deepseek-v4-flash"
    process.env.OPENROUTER_REASONING_EFFORT = "high"
    process.env.OPENROUTER_REASONING_EXCLUDE = "true"
    delete process.env.OPENROUTER_REASONING_MAX_TOKENS

    expect(openRouterReasoning("deepseek/deepseek-v4-flash")).toEqual({
      reasoning: { effort: "high", exclude: true },
    })
  })

  it("does not add reasoning to models outside the configured list", () => {
    process.env.OPENROUTER_REASONING_MODELS = "deepseek/deepseek-v4-flash"
    expect(openRouterReasoning("openai/gpt-audio-mini")).toEqual({})
  })

  it("supports a token budget when explicitly configured", () => {
    process.env.OPENROUTER_REASONING_MODELS = "deepseek/deepseek-v4-flash"
    process.env.OPENROUTER_REASONING_MAX_TOKENS = "2048"
    expect(openRouterReasoning("deepseek/deepseek-v4-flash")).toEqual({
      reasoning: { max_tokens: 2048, exclude: true },
    })
  })
})
