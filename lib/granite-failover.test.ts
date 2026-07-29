import { describe, expect, it } from "vitest"
import {
  GRANITE_BACKUP_MODEL,
  recordGranitePerformance,
  resolveGraniteModel,
} from "./granite-failover"

describe("Granite failover", () => {
  it("opens a circuit per Granite model without affecting healthy siblings", () => {
    const degraded = "ibm-granite/test-degraded"
    const healthySibling = "ibm-granite/test-healthy"
    const payload = { usage: { completion_tokens: 1 } }

    recordGranitePerformance(degraded, 10_000, payload)
    recordGranitePerformance(degraded, 10_000, payload)

    expect(resolveGraniteModel(degraded)).toBe(GRANITE_BACKUP_MODEL)
    expect(resolveGraniteModel(healthySibling)).toBe(healthySibling)
  })

  it("does not rewrite non-Granite models", () => {
    expect(resolveGraniteModel("openai/gpt-5.4-nano")).toBe("openai/gpt-5.4-nano")
  })
})
