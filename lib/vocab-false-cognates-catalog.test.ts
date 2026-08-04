import { describe, expect, it } from "vitest"
import {
  VOCAB_FALSE_COGNATES_CATALOG,
  VOCAB_FALSE_COGNATES_FOLDER_NAME,
  validateVocabFalseCognatesCatalog,
} from "./vocab-false-cognates-catalog"

describe("VocabLab false-cognates catalog", () => {
  it("contains the 50 PDF entries plus its bonus entry", () => {
    expect(VOCAB_FALSE_COGNATES_FOLDER_NAME).toBe("False Cognates Essentials")
    expect(VOCAB_FALSE_COGNATES_CATALOG).toHaveLength(51)
    expect(() => validateVocabFalseCognatesCatalog()).not.toThrow()
  })

  it("stores English headwords and keeps the Portuguese trap in the warning", () => {
    const actual = VOCAB_FALSE_COGNATES_CATALOG.find((entry) => entry.word === "actual")
    expect(actual).toMatchObject({
      partOfSpeech: "adjective",
      translation: "real / verdadeiro",
      falseCognate: {
        isFalseCognate: true,
        warning: "Para algo referente ao presente, use current.",
        warningEn: "Use current for something belonging to the present time.",
      },
    })
    expect(VOCAB_FALSE_COGNATES_CATALOG.some((entry) => entry.word === "atual")).toBe(false)
    expect(VOCAB_FALSE_COGNATES_CATALOG.some((entry) => entry.word === "current")).toBe(false)
  })

  it("marks every entry as a false cognate with an English correction", () => {
    for (const entry of VOCAB_FALSE_COGNATES_CATALOG) {
      expect(entry.falseCognate?.isFalseCognate).toBe(true)
      expect(entry.falseCognate?.warning.trim()).toBeTruthy()
      expect(entry.falseCognate?.warningEn?.trim()).toBeTruthy()
      expect(entry.example).toMatch(/[.!?]$/)
      expect(entry.exampleTranslation?.trim()).toBeTruthy()
      expect(entry.usageNote).not.toMatch(/^Em inglês, .+ significa/i)
      expect(entry.usageNoteEn).not.toContain("is a false cognate")
    }
  })

  it("uses contextual guidance instead of repeating the card translation", () => {
    const agenda = VOCAB_FALSE_COGNATES_CATALOG.find((entry) => entry.word === "agenda")
    const sensible = VOCAB_FALSE_COGNATES_CATALOG.find((entry) => entry.word === "sensible")
    expect(agenda?.usageNote).toContain("pauta ou lista de assuntos de uma reunião")
    expect(agenda?.falseCognate?.warning).toContain("planner ou diary")
    expect(sensible?.usageNote).toContain("decisão prática")
    expect(sensible?.falseCognate?.warning).toContain("sensitive")
  })
})
