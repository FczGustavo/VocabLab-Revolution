import type { GrammaticalForm } from "@/lib/types"

export const grammaticalFormLabels: Record<GrammaticalForm, string> = {
  "base-form": "Base form",
  comparative: "Comparative",
  superlative: "Superlative",
  plural: "Plural",
  past: "Past",
  "past-participle": "Past participle",
  "present-participle": "Present participle",
  "third-person-singular": "Third-person singular",
}

export const grammaticalForms = Object.keys(grammaticalFormLabels) as GrammaticalForm[]

export function normalizeGrammaticalForm(value: unknown): GrammaticalForm {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-")
  return grammaticalForms.includes(normalized as GrammaticalForm)
    ? normalized as GrammaticalForm
    : "base-form"
}

export function resolveGrammaticalForm(value: unknown, word: string, partOfSpeech: string): GrammaticalForm {
  const token = word.trim().toLowerCase()
  let declared = normalizeGrammaticalForm(value)
  const normalizedPartOfSpeech = partOfSpeech.trim().toLowerCase()
  const allowedByPartOfSpeech: Partial<Record<string, Set<GrammaticalForm>>> = {
    verb: new Set(["base-form", "past", "past-participle", "present-participle", "third-person-singular"]),
    "phrasal-verb": new Set(["base-form", "past", "past-participle", "present-participle", "third-person-singular"]),
    noun: new Set(["base-form", "plural"]),
    adjective: new Set(["base-form", "comparative", "superlative"]),
    adverb: new Set(["base-form", "comparative", "superlative"]),
  }
  const allowed = allowedByPartOfSpeech[normalizedPartOfSpeech]
  if (allowed && !allowed.has(declared)) declared = "base-form"
  // These lemmas end in the letters "ed" but are not past-tense spellings.
  if (/^(?:succeed|proceed|exceed)$/.test(token) && (declared === "past" || declared === "past-participle")) {
    declared = "base-form"
  }
  if (declared !== "base-form") return declared
  const irregular: Record<string, GrammaticalForm> = {
    better: "comparative",
    worse: "comparative",
    farther: "comparative",
    further: "comparative",
    best: "superlative",
    worst: "superlative",
    farthest: "superlative",
    furthest: "superlative",
    children: "plural",
    people: "plural",
    men: "plural",
    women: "plural",
    mice: "plural",
    geese: "plural",
    teeth: "plural",
    feet: "plural",
    went: "past",
    saw: "past",
    wrote: "past",
    took: "past",
    gave: "past",
    written: "past-participle",
    taken: "past-participle",
    given: "past-participle",
    seen: "past-participle",
    gone: "past-participle",
  }
  if (irregular[token]) return irregular[token]
  if ((partOfSpeech === "adjective" || partOfSpeech === "adverb") && token.endsWith("est")) return "superlative"
  if ((partOfSpeech === "adjective" || partOfSpeech === "adverb") && token.endsWith("er")) return "comparative"
  if ((partOfSpeech === "verb" || partOfSpeech === "phrasal-verb") && token.endsWith("ing")) return "present-participle"
  if (
    (partOfSpeech === "verb" || partOfSpeech === "phrasal-verb") &&
    token.endsWith("ed") &&
    !/^(?:succeed|proceed|exceed)$/.test(token)
  ) return "past"
  return declared
}
