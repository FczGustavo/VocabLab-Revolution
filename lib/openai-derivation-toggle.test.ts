import { afterEach, describe, expect, it, vi } from "vitest"
import { generateFlashcardData } from "./openai"

const ORIGINAL_API_KEY = process.env.OPENROUTER_API_KEY

function mockPrimaryResponse() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            normalizedWord: "quick",
            partOfSpeech: "adjective",
            grammaticalForm: "base-form",
            translation: "rápido",
            ipa: "kwɪk",
            usageNote: "Moving or happening at a high speed.",
            usageNoteEn: "Moving or happening at a high speed.",
            synonyms: [],
            antonyms: [],
            example: "She made a quick decision during the meeting.",
            exampleTranslation: "Ela tomou uma decisão rápida durante a reunião.",
            alternativeForms: [
              {
                word: "quickly",
                partOfSpeech: "adverb",
                translation: "rapidamente",
                example: "He quickly finished the report.",
              },
            ],
            familyKey: "quick",
            usageStatus: "current",
            verbType: null,
            conjugations: null,
          }),
        },
      },
    ],
  }
}

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = ORIGINAL_API_KEY
  vi.unstubAllGlobals()
})

describe("derivation generation toggle", () => {
  it("does not call the derivation or review pipeline when disabled", async () => {
    process.env.OPENROUTER_API_KEY = "test-key"
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPrimaryResponse(),
      text: async () => "",
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await generateFlashcardData("quick", "google/gemini-3.1-flash-lite", {
      includeAlternativeForms: false,
    })

    expect(result.alternativeForms).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps derivations disabled when the option is omitted", async () => {
    process.env.OPENROUTER_API_KEY = "test-key"
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPrimaryResponse(),
      text: async () => "",
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await generateFlashcardData("quick", "google/gemini-3.1-flash-lite")

    expect(result.alternativeForms).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
