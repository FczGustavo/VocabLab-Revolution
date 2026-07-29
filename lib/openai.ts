import type { Flashcard, GrammarQuestionOption, AlternativeForm } from "./types"
import { partitionDerivationsForValidation } from "./derivation-validation"
import { normalizeGrammaticalForm, resolveGrammaticalForm } from "./grammatical-forms"
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
export const DEFAULT_AI_MODEL = process.env.DEFAULT_AI_MODEL ?? "openai/gpt-5.4-nano"
export const GRAMMAR_AI_MODEL = process.env.GRAMMAR_AI_MODEL ?? DEFAULT_AI_MODEL
export const REVISOR_AI_MODEL = process.env.REVISOR_AI_MODEL ?? DEFAULT_AI_MODEL
const DERIVATION_AI_MODEL = process.env.DERIVATION_AI_MODEL ?? DEFAULT_AI_MODEL
const MIN_LEXICAL_FREQUENCY = 0.1
export const MAX_LEARNER_DERIVATIONS = 4
const derivationFrequencyCache = new Map<string, Promise<number | undefined>>()
const derivationDictionaryCache = new Map<string, Promise<boolean | undefined>>()

// Base URL for internal API route calls from server-side code. Falls back to
// localhost when no public URL is configured (dev environment).
function getBaseUrl(): string {
  return (
    (globalThis as any).process?.env?.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location?.origin : "http://localhost:3000")
  )
}
interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string
}
interface OpenRouterResponse {
  choices: {
    message: {
      content: string
    }
  }[]
}
const VALID_PARTS_OF_SPEECH = [
  "verb",
  "phrasal-verb",
  "noun",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "interjection",
  "acronym",
  "idiom",
] as const
const VALID_RELATION_TYPES = ["literal", "figurative", "slang", "abstract"] as const
function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
function normalizeIpa(value: unknown): string {
  if (typeof value !== "string") return ""
  let cleaned = value.trim()
  if (!cleaned) return ""
  // Strip surrounding slashes the model sometimes adds (e.g. "/'pr?ti/" ? "'pr?ti")
  cleaned = cleaned.replace(/^\/+/, "").replace(/\/+$/, "")
  cleaned = cleaned.replace(/^\[(.+)\]$/, "$1")
  return normalizeInlineWhitespace(cleaned)
}
function normalizeInlineWhitespace(value: unknown): string {
  return asTrimmedString(value).replace(/\s+/g, " ")
}
function truncateAtWord(value: string, maxLength = 180): string {
  const normalized = normalizeInlineWhitespace(value)
  if (normalized.length <= maxLength) return normalized
  const clipped = normalized.slice(0, maxLength + 1)
  const boundary = clipped.lastIndexOf(" ")
  return `${clipped.slice(0, boundary > maxLength * 0.65 ? boundary : maxLength).replace(/[,:;\s]+$/, "")}.`
}
function normalizeTranslationText(value: unknown): string {
  const normalized = normalizeInlineWhitespace(value)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    // Models occasionally separate equivalents with semicolons despite the
    // requested slash format. Canonicalize before counting alternatives so a
    // three-item response cannot bypass the two-translation limit.
    .replace(/\s*;\s*/g, " / ")
    .replace(/\s*,\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized.includes("/")) return normalized
  return normalized
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" / ")
}
function pickPrimaryTranslation(value: string): string {
  const chunks = normalizeTranslationText(value)
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
  return chunks[0] ?? ""
}
function isAcronymCandidate(value: string): boolean {
  const token = normalizeInlineWhitespace(value)
  if (!/^[A-Za-z]{2,8}$/.test(token)) return false
  // All uppercase = strong acronym signal (OWW, NASA, BBC)
  if (token === token.toUpperCase() && /[A-Z]{2,}/.test(token)) return true
  const lower = token.toLowerCase()
  const vowels = (lower.match(/[aeiou]/g) ?? []).length
  const hasTripleConsonant = /[bcdfghjklmnpqrstvwxyz]{3,}/i.test(token)
  // Strong signal for lowercase acronyms such as oow, eta, bwms.
  return vowels <= 2 || hasTripleConsonant
}
const PHRASAL_PARTICLES = new Set([
  "about", "across", "after", "ahead", "along", "apart", "around", "away", "back", "by", "down", "for", "in", "into", "off", "on", "out", "over", "through", "to", "together", "under", "up", "with",
])
function looksLikePhrasalVerb(value: string): boolean {
  const tokens = normalizeInlineWhitespace(value).toLowerCase().split(" ").filter(Boolean)
  return tokens.length >= 2 && PHRASAL_PARTICLES.has(tokens[1])
}
function inferPartOfSpeechWithAcronymFallback(params: {
  originalWord: string
  normalizedWord: string
  rawPartOfSpeech: string
  translation: string
  usageNote: string
}): { partOfSpeech: string; normalizedWord: string } {
  const rawPos = normalizePartOfSpeech(params.rawPartOfSpeech)
  const candidate = normalizeInlineWhitespace(params.originalWord)
  const normalizedWord = normalizeInlineWhitespace(params.normalizedWord || candidate)
  // Multi-word entries: let the AI decide between phrase/idiom, keep what AI returned
  if (candidate.includes(" ")) {
    if (rawPos === "idiom" || rawPos === "phrasal-verb" || rawPos === "acronym") {
      return { partOfSpeech: rawPos, normalizedWord }
    }
    if (rawPos === "verb" && looksLikePhrasalVerb(normalizedWord)) {
      return { partOfSpeech: "phrasal-verb", normalizedWord }
    }
    return { partOfSpeech: "idiom", normalizedWord }
  }
  // Idioms and phrasal verbs are multi-word expressions by definition. A
  // compact model occasionally emits "idiom" for a single token (e.g.
  // "come"); never persist that structural mismatch.
  if (rawPos === "idiom" || rawPos === "phrasal-verb") {
    const translationKind = classifyPtBrChunk(params.translation)
    const recoveredPartOfSpeech =
      translationKind === "verb" ||
      translationKind === "adverb" ||
      translationKind === "preposition" ||
      translationKind === "conjunction" ||
      translationKind === "interjection"
        ? translationKind
        : /ly$/i.test(candidate)
          ? "adverb"
          : /(ness|ment|tion|sion|ity|ism)$/i.test(candidate)
            ? "noun"
            : /(ful|less|ous|ive|able|ible)$/i.test(candidate)
              ? "adjective"
              : /(ize|ify)$/i.test(candidate)
                ? "verb"
                : "noun"
    return { partOfSpeech: recoveredPartOfSpeech, normalizedWord }
  }
  if (rawPos === "acronym") {
    return {
      partOfSpeech: "acronym",
      normalizedWord: normalizedWord.toUpperCase(),
    }
  }
  const note = normalizeInlineWhitespace(params.usageNote).toLowerCase()
  const translation = normalizeInlineWhitespace(params.translation).toLowerCase()
  const hasAcronymSignal = /(sigla|acr[o�]nimo|stands for|abrevia[c�][a�]o|abrevia��o)/i.test(note + " " + translation)
  if (!isAcronymCandidate(candidate) || !hasAcronymSignal) {
    return {
      partOfSpeech: rawPos,
      normalizedWord,
    }
  }
  return {
    partOfSpeech: "acronym",
    normalizedWord: candidate.toUpperCase(),
  }
}
function classifyPtBrChunk(value: string):
  | "verb"
  | "noun_or_phrase"
  | "adverb"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "adjective"
  | "unknown" {
  const chunk = normalizeInlineWhitespace(value).toLowerCase()
  if (!chunk) return "unknown"
  if (/^(a|ante|ap[o�]s?|at[e�]|com|contra|de|desde|em|entre|para|per(?:ante)?|por|sem|sob|sobre|tr[a�]s?)$/.test(chunk)) return "preposition"
  if (/^(e|ou|mas|por(?:que|�m)?|pois|entretanto|todavia|logo|portanto|que|se|quando|embora)$/.test(chunk)) return "conjunction"
  if (/^(o?l[a�]|opa|ei|uau+|[a�]h|[o�]h|nossa|poxa|ix[i�]|viva)$/.test(chunk)) return "interjection"
  if (/\bmente$/.test(chunk) || /^(bem|mal|bastante|muito|quase|raramente|dificilmente|frequentemente|geralmente|normalmente|apenas|somente|s[o�]|jamais|nunca|sempre|ainda|j[a�]|antes|depois|ent[a�]o|relativamente|moderadamente|preferencialmente)$/i.test(chunk)) return "adverb"
  if (/^(?:de forma alguma|de modo algum|de jeito nenhum|ao menos|pelo menos|mais ou menos)$/i.test(chunk)) return "adverb"
  if (/^\w+(?:ar|er|ir)$/.test(chunk) && !/\s/.test(chunk)) return "verb"
  if (/^(?:o|a|os|as|um|uma|uns|umas)\b/.test(chunk) || /\s/.test(chunk)) return "noun_or_phrase"
  return "noun_or_phrase"
}
function isPosCompatible(kind: string, partOfSpeech: string): boolean {
  if (partOfSpeech === "verb" || partOfSpeech === "phrasal-verb") return kind === "verb"
  if (partOfSpeech === "adverb") return kind === "adverb"
  if (partOfSpeech === "preposition") return kind === "preposition"
  if (partOfSpeech === "conjunction") return kind === "conjunction"
  if (partOfSpeech === "interjection") return kind === "interjection"
  if (partOfSpeech === "noun") return kind === "noun_or_phrase"
  if (partOfSpeech === "acronym" || partOfSpeech === "idiom") {
    return kind === "noun_or_phrase" || kind === "adjective" || kind === "unknown"
  }
  if (partOfSpeech === "adjective") return kind === "adjective" || kind === "unknown"
  return true
}
function realignPartOfSpeechByTranslation(partOfSpeech: string, translation: string): string {
  // Never override idiom/acronym — those are structural classifications.
  if (partOfSpeech === "acronym" || partOfSpeech === "idiom" || partOfSpeech === "phrasal-verb") return partOfSpeech
  const primaryChunk = pickPrimaryTranslation(translation)
  const kind = classifyPtBrChunk(primaryChunk)
  // When the pt-BR classifier returns "noun_or_phrase" it's the fallback bucket
  // — it covers nouns, adjectives, and many other things (anything that isn't
  // clearly a verb/adverb/preposition/conjunction/interjection). It is NOT a
  // signal that the IA's POS is wrong. Realignment must be CONSERVATIVE: only
  // override the IA when the pt-BR chunk gives an UNAMBIGUOUS, conflicting
  // classification (e.g. translation is clearly a verb infinitive -ar/-er/-ir
  // but POS is "noun", or translation ends in -mente but POS isn't "adverb").
  if (kind === "unknown" || kind === "noun_or_phrase") return partOfSpeech
  if (isPosCompatible(kind, partOfSpeech)) return partOfSpeech
  // Only the unambiguous kinds below can override the IA's POS.
  if (kind === "verb") return "verb"
  if (kind === "adverb") return "adverb"
  if (kind === "preposition") return "preposition"
  if (kind === "conjunction") return "conjunction"
  if (kind === "interjection") return "interjection"
  // "adjective" is never returned by classifyPtBrChunk for pt-BR adjectives
  // (no reliable pattern), so we never force-convert TO adjective here.
  return partOfSpeech
}
function filterTranslationChunks(
  value: unknown,
  includeMultipleTranslations: boolean,
  partOfSpeech: string,
  allowMultipleForIdiom = false
): string {
  const normalized = normalizeTranslationText(value)
  const chunks = normalized
    .split("/")
    .map((item) => normalizeInlineWhitespace(item))
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index)
  if (chunks.length === 0) return ""
  // Previously this function filtered translations using classifyPtBrChunk +
  // isPosCompatible, but classifyPtBrChunk cannot reliably identify pt-BR
  // adjectives (it lumps them into "noun_or_phrase"), so the filter was
  // silently dropping valid translations for adjectives and other classes.
  // Trust the AI's translation output — the prompt already enforces POS-
  // translation coherence via the CROSS-FIELD COHERENCE instruction.
  if (partOfSpeech === "acronym" || (partOfSpeech === "idiom" && !allowMultipleForIdiom)) return chunks[0]
  if (!includeMultipleTranslations) return chunks[0]
  return chunks.slice(0, 2).join(" / ")
}
function normalizePtBrOrthography(value: unknown): string {
  let text = normalizeInlineWhitespace(value)
  if (!text) return ""
  const replacements: Array<[RegExp, string]> = [
    [/\bid�ia\b/gi, "ideia"],
    [/\bid�ias\b/gi, "ideias"],
    [/\bassembl�ia\b/gi, "assembleia"],
    [/\bassembl�ias\b/gi, "assembleias"],
    [/\bplat�ia\b/gi, "plateia"],
    [/\bher�ico\b/gi, "heroico"],
    [/\bher�icos\b/gi, "heroicos"],
    [/\bj�ia\b/gi, "joia"],
    [/\bj�ias\b/gi, "joias"],
    [/\bparan�ia\b/gi, "paranoia"],
    [/\bparan�ias\b/gi, "paranoias"],
    [/\bb�ia\b/gi, "boia"],
    [/\bb�ias\b/gi, "boias"],
    [/\bjib�ia\b/gi, "jiboia"],
    [/\bjib�ias\b/gi, "jiboias"],
    [/\bv�o\b/gi, "voo"],
    [/\bv�os\b/gi, "voos"],
    [/\benj�o\b/gi, "enjoo"],
    [/\benj�os\b/gi, "enjoos"],
    [/\bcr�em\b/gi, "creem"],
    [/\bd�em\b/gi, "deem"],
    [/\bl�em\b/gi, "leem"],
    [/\bv�em\b/gi, "veem"],
    [/\bp�ra\b/gi, "para"],
  ]
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement)
  }
  // Remove trema remnants from pre-accord spellings in PT-BR text.
  text = text.replace(/�/g, "u").replace(/�/g, "U")
  return text
}
function normalizePtBrOrthographyMultiline(value: unknown): string {
  const raw = asTrimmedString(value)
  if (!raw) return ""
  const normalizedLines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeInlineWhitespace(line))
    .filter(Boolean)
  const normalized = normalizePtBrOrthography(normalizedLines.join("\n")).replace(/\s*\n\s*/g, "\n")
  // If the model returns block labels in a single line, force line breaks before each label.
  const labelPatterns = [
    "Uso principal",
    "Principais usos",
    "Preferencia",
    "Prefer�ncia",
    "Contraste",
    "Nuance",
    "Estrutura comum",
    "Estrutura",
    "Intensificador",
    "Atenuador",
    "Preferencia / Alternativa",
    "Prefer�ncia / Alternativa",
    "Como Adjetivo",
    "Como Adverbio",
    "Como Adv�rbio",
    "Como Substantivo",
    "Como Verbo",
    "Como Preposi��o",
    "Como Conjun��o",
    "Como Interjei��o",
    "Como Express�o",
    "Como Sigla", "Como Expressao",
  ]
  let withBreaks = normalized
  for (const label of labelPatterns) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`\\s+(${escapedLabel}:)`, "gi")
    withBreaks = withBreaks.replace(regex, "\n$1")
  }
  return withBreaks
}
function getUsagePrimaryLabel(partOfSpeech: string): string {
  switch (partOfSpeech) {
    case "verb":
      return "Como Verbo"
    case "phrasal-verb":
      return "Como Phrasal Verb"
    case "noun":
      return "Como Substantivo"
    case "adjective":
      return "Como Adjetivo"
    case "adverb":
      return "Como Adv�rbio"
    case "preposition":
      return "Como Preposi��o"
    case "conjunction":
      return "Como Conjun��o"
    case "interjection":
      return "Como Interjei��o"
    case "idiom":
      return "Como Express�o"
    case "acronym":
      return "Como Sigla"
    case "idiom":
      return "Como Expressao"
    default:
      return "Uso principal"
  }
}
function getPartOfSpeechPtName(partOfSpeech: string): string {
  switch (partOfSpeech) {
    case "verb":
      return "verbo"
    case "phrasal-verb":
      return "phrasal verb"
    case "noun":
      return "substantivo"
    case "adjective":
      return "adjetivo"
    case "adverb":
      return "adv�rbio"
    case "preposition":
      return "preposi��o"
    case "conjunction":
      return "conjun��o"
    case "interjection":
      return "interjei��o"
    case "idiom":
      return "express�o"
    case "acronym":
      return "sigla"
    case "idiom":
      return "expressao idiomatica"
    default:
      return "classe"
  }
}
function normalizeForLooseMatch(value: string): string {
  return normalizeInlineWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}
function stripLeadingConjunction(value: string): string {
  return value.replace(/^(mas|por[e�]m|entretanto|todavia|s[o�] que)\b[\s,:-]*/i, "")
}
function normalizeUsageSentence(value: string): string {
  let text = normalizeInlineWhitespace(value)
  if (!text) return ""
  text = stripLeadingConjunction(text)
  text = text
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/,\./g, ".")
    .replace(/\.\,+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim()
  return text.replace(/[.!?]$/, "").trim()
}
function capitalizeSentenceStart(value: string): string {
  const normalized = normalizeInlineWhitespace(value)
  if (!normalized) return ""
  return normalized.replace(/^[a-z�-�]/i, (char) => char.toUpperCase())
}
function enrichVagueUsageByPartOfSpeech(text: string, _partOfSpeech: string): string {
  // Previously this function injected hardcoded pt-BR phrases into the AI's
  // usage notes for adverbs (e.g. appending "Prefira equivalentes diretos de
  // uso: bastante, razoavelmente, raramente, dificilmente."). That overrode
  // the AI's wording and was specific to a handful of adverbs. We now trust
  // the AI's usage note as-is — the prompt already enforces dictionary-style
  // output and the lexicographer-review pass catches vague/generic notes.
  return normalizeInlineWhitespace(text)
}
function normalizeUsageNoteByPartOfSpeech(value: unknown, _partOfSpeech: string, _word?: string, _translation?: string): string {
  const raw = normalizePtBrOrthographyMultiline(value)
  if (!raw) return ""
  // Only strip the "Em inglês:" prefix the model sometimes adds. Do NOT strip
  // dictionary labels like "Nuance:", "Estrutura comum:" etc — those are
  // legitimate content the AI produced and may carry meaning. Trust the AI.
  const cleaned = raw
    .replace(/\bem\s+ingl[e�]s\b[,:\-]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return ""
  const normalizedForSplit = cleaned
    .replace(/\s+(Mas|Por[e�]m|Tamb[e�]m|Em fala|No uso informal|Na fala)\b/gi, ". $1")
    .replace(/\.+/g, ".")
  const sentences = normalizedForSplit
    .split(/(?<=[.!?])\s+/)
    .map((s) => normalizeUsageSentence(s))
    .filter(Boolean)
  if (sentences.length === 0) return ""
  const deduped: string[] = []
  for (const sentence of sentences) {
    const key = normalizeForLooseMatch(sentence).replace(/[.!?]/g, "").trim()
    if (!key) continue
    if (deduped.some((existing) => normalizeForLooseMatch(existing).replace(/[.!?]/g, "").trim() === key)) continue
    deduped.push(sentence)
    if (deduped.length >= 2) break
  }
  if (deduped.length === 0) return ""
  return truncateAtWord(deduped
    .map((s) => capitalizeSentenceStart(s))
    .map((s) => (s.endsWith(".") || s.endsWith("!") || s.endsWith("?") ? s : `${s}.`))
    .join(" "))
}
function normalizePartOfSpeech(value: unknown, fallback: string = "noun"): string {
  const normalized = asTrimmedString(value).toLowerCase().trim()
  if (!normalized) return fallback
  // Direct match.
  if (VALID_PARTS_OF_SPEECH.includes(normalized as (typeof VALID_PARTS_OF_SPEECH)[number])) {
    return normalized
  }
  // Common abbreviations / variants the model sometimes returns. Map them
  // to the canonical POS instead of falling back to "noun" (which would
  // silently misclassify). This is NOT a whitelist of allowed POS values —
  // it's just a normalization table for known synonyms/abbreviations.
  const abbreviationMap: Record<string, string> = {
    adj: "adjective",
    adjectiveform: "adjective",
    adv: "adverb",
    advb: "adverb",
    n: "noun",
    nounform: "noun",
    v: "verb",
    vb: "verb",
    vt: "verb",
    vi: "verb",
    prep: "preposition",
    conj: "conjunction",
    interj: "interjection",
    intj: "interjection",
    expr: "idiom",
    expression: "idiom",
    phrase: "idiom",
    phrasalverb: "phrasal-verb",
    "phrasal verb": "phrasal-verb",
    "phrasal-verb": "phrasal-verb",
    abbreviation: "acronym",
    abbrev: "acronym",
    initialism: "acronym",
  }
  const mapped = abbreviationMap[normalized]
  if (mapped && VALID_PARTS_OF_SPEECH.includes(mapped as (typeof VALID_PARTS_OF_SPEECH)[number])) {
    return mapped
  }
  return fallback
}
function normalizeRelationType(value: unknown): (typeof VALID_RELATION_TYPES)[number] {
  const normalized = asTrimmedString(value).toLowerCase()
  return VALID_RELATION_TYPES.includes(normalized as (typeof VALID_RELATION_TYPES)[number])
    ? (normalized as (typeof VALID_RELATION_TYPES)[number])
    : "literal"
}
function normalizeLexicalRelations(raw: unknown, maxItems: number) {
  if (!Array.isArray(raw) || maxItems <= 0) return []
  const seen = new Set<string>()
  const normalized = raw
    .map((item) => {
      const value = item as { word?: unknown; type?: unknown }
      const word = normalizeInlineWhitespace(value?.word)
      if (!word) return null
      return {
        word,
        type: normalizeRelationType(value?.type),
      }
    })
    .filter((item): item is { word: string; type: (typeof VALID_RELATION_TYPES)[number] } => Boolean(item))
    .filter((item) => {
      const key = item.word.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxItems)
  return normalized
}
// Deterministic blocklist of known archaic/rare/useless word::partOfSpeech
// combinations that AI models sometimes include but learners should never see.
// This guard runs BEFORE the validator, so it doesn't depend on any model.
const ARCHAIC_ALT_FORM_BLOCKLIST = new Set([
  "quick::noun",       // "the quick and the dead" — archaic, useless for learners
  "alive::noun",       // extremely rare; not a learner's dictionary entry
  "dead::verb",        // archaic/poetic
  "slow::verb",        // marginal; "slow down" is phrasal, not base form
  "fast::verb",        // rare/archaic ("to fast" = to not eat — separate lexeme)
])

// Translations that signal the AI returned an archaic or wrong sense.
// If a derivation's translation matches any of these patterns, reject it.
const ARCHAIC_TRANSLATION_PATTERNS = [
  /carne[- ]*viva/i,
  /\bâmago\b/i,
  /\bamago\b/i,
  /\bvivos?\s*(e\s*mortos)?\b/i,   // "the quick" = the living
  /\bjeju[mn]/i,                    // "fast" as abstinence/jejum
]

// Portuguese bare verb infinitive pattern (-ar/-er/-ir, possibly + pronoun clitic).
// e.g. "manter", "guardar", "manter-se", "manter / guardar"
const PT_VERB_INFINITIVE_RE = /^(?:[a-záàãâéêíóõôúüç][a-záàãâéêíóõôúüç'-]*(ar|er|ir|or))(\s*[-/]\s*[a-záàãâéêíóõôúüç][a-záàãâéêíóõôúüç'-]*(ar|er|ir|or))*$/i

// Returns true when the primary pt-BR chunk looks like a bare Portuguese
// verb infinitive (ends in -ar/-er/-ir) without any article or qualifier.
function looksLikePtVerbInfinitive(translation: string): boolean {
  const primary = translation.split("/")[0].trim()
  return PT_VERB_INFINITIVE_RE.test(primary)
}

function looksLikeNonEnglishExample(value: string): boolean {
  const normalized = normalizeInlineWhitespace(value).toLowerCase()
  if (/[áàãâéêíóõôúüç]/i.test(normalized)) return true
  const tokens = normalized.match(/[a-z]+/g) ?? []
  const portugueseMarkers = new Set([
    "os", "as", "uma", "umas", "uns", "dos", "das", "em", "no", "na", "nos", "nas",
    "para", "por", "com", "sem", "que", "ele", "ela", "eles", "elas", "foi", "foram",
    "estava", "estavam", "seu", "sua", "antes", "depois",
  ])
  const englishMarkers = new Set([
    "the", "a", "an", "to", "of", "in", "on", "at", "for", "with", "without", "that",
    "he", "she", "they", "it", "was", "were", "is", "are", "before", "after",
  ])
  const ptScore = tokens.filter((token) => portugueseMarkers.has(token)).length
  const enScore = tokens.filter((token) => englishMarkers.has(token)).length
  return ptScore >= 3 && enScore < 2
}

/**
 * Alternative forms are lexical family members, not grammar inflections.
 * This deliberately relies on spelling morphology rather than a word list:
 * it rejects only the regular comparative/superlative patterns that a model
 * can otherwise mistake for a new dictionary headword (quick → quicker).
 */
function isAdjectiveDegreeVariant(baseWord: string, candidateWord: string): boolean {
  const base = baseWord.toLowerCase()
  const candidate = candidateWord.toLowerCase()
  if (!base || candidate.length <= base.length) return false

  const forms = new Set([`${base}er`, `${base}est`])
  if (base.endsWith("e")) {
    forms.add(`${base}r`)
    forms.add(`${base}st`)
  }
  if (base.endsWith("y") && base.length > 1) {
    forms.add(`${base.slice(0, -1)}ier`)
    forms.add(`${base.slice(0, -1)}iest`)
  }
  // Regular CVC doubling, e.g. big → bigger/biggest, thin → thinner/thinnest.
  if (/[^aeiou][aeiou][^aeiou]$/.test(base) && !/[wxy]$/.test(base)) {
    const doubled = `${base}${base.at(-1)}`
    forms.add(`${doubled}er`)
    forms.add(`${doubled}est`)
  }
  return forms.has(candidate)
}

function isNounPluralVariant(baseWord: string, candidateWord: string): boolean {
  const base = baseWord.toLowerCase()
  const candidate = candidateWord.toLowerCase()
  if (!base || candidate.length <= base.length) return false

  const forms = new Set([`${base}s`])
  if (/(?:s|x|z|ch|sh)$/.test(base)) forms.add(`${base}es`)
  if (/[^aeiou]y$/.test(base)) forms.add(`${base.slice(0, -1)}ies`)
  if (/fe$/.test(base)) forms.add(`${base.slice(0, -2)}ves`)
  else if (/f$/.test(base)) forms.add(`${base.slice(0, -1)}ves`)
  return forms.has(candidate)
}

function isRegularVerbInflectionVariant(baseWord: string, candidateWord: string): boolean {
  const base = baseWord.toLowerCase()
  const candidate = candidateWord.toLowerCase()
  if (!base || candidate.length <= base.length) return false

  const forms = new Set<string>()
  const addIng = () => {
    forms.add(`${base}ing`)
    if (base.endsWith("e") && !base.endsWith("ee")) forms.add(`${base.slice(0, -1)}ing`)
    if (base.endsWith("ie")) forms.add(`${base.slice(0, -2)}ying`)
    if (/[^aeiou][aeiou][^aeiou]$/.test(base) && !/[wxy]$/.test(base)) {
      forms.add(`${base}${base.at(-1)}ing`)
    }
  }
  const addPast = () => {
    forms.add(`${base}ed`)
    if (base.endsWith("e")) forms.add(`${base}d`)
    if (/[^aeiou]y$/.test(base)) forms.add(`${base.slice(0, -1)}ied`)
    if (/[^aeiou][aeiou][^aeiou]$/.test(base) && !/[wxy]$/.test(base)) {
      forms.add(`${base}${base.at(-1)}ed`)
    }
  }
  addIng()
  addPast()
  forms.add(`${base}s`)
  if (/(?:s|x|z|ch|sh|o)$/.test(base)) forms.add(`${base}es`)
  if (/[^aeiou]y$/.test(base)) forms.add(`${base.slice(0, -1)}ies`)
  return forms.has(candidate)
}

function looksLikePtGerund(translation: string): boolean {
  const primary = translation.split("/")[0]?.trim() ?? ""
  return /\b[a-záàãâéêíóõôúüç-]+(?:ando|endo|indo)\b/i.test(primary)
}

/**
 * Shared deterministic filter applied to any array of alternativeForms,
 * regardless of which pipeline produced them (main generation, background
 * alt-POS fetch, or lexicographer-review correction).
 *
 * Removes:
 * - Known archaic/useless word::partOfSpeech combinations (blocklist)
 * - Derivations whose Portuguese translation signals an archaic sense
 * - POS-translation incoherence (e.g. noun with a bare verb infinitive
 *   translation like "manter / guardar", or verb with a non-infinitive)
 */
export function filterArchaicAlternativeForms<T extends { word: string; partOfSpeech: string; translation: string; example: string }>(
  alts: T[],
  baseWord?: string
): T[] {
  return alts.filter((alt) => {
    const blockKey = `${alt.word.toLowerCase()}::${alt.partOfSpeech}`
    if (ARCHAIC_ALT_FORM_BLOCKLIST.has(blockKey)) return false
    if (ARCHAIC_TRANSLATION_PATTERNS.some((p) => p.test(alt.translation))) return false
    // A regular verb inflection is not a family headword merely because the
    // model labelled it as a noun. Keep lexicalized -ing nouns (building,
    // meeting) only when their Portuguese translation is genuinely nominal.
    if (
      alt.partOfSpeech === "noun" &&
      Boolean(baseWord) &&
      isRegularVerbInflectionVariant(baseWord ?? "", alt.word) &&
      looksLikePtGerund(alt.translation)
    ) return false
    // POS-translation coherence:
    // noun alt-forms must NOT have a bare Portuguese verb infinitive as translation.
    // (e.g. "keep" as noun → "manter / guardar" is WRONG; should be "guarda / custódia")
    if (alt.partOfSpeech === "noun" && looksLikePtVerbInfinitive(alt.translation)) return false
    // verb alt-forms should have an infinitive translation (warn but don't hard-reject;
    // some verbs have periphrastic translations like "ser capaz de" that don't end in -ar/-er/-ir).
    return true
  }).slice(0, MAX_LEARNER_DERIVATIONS)
}

function normalizeAlternativeForms(
  raw: unknown,
  mainWord: string,
  mainPartOfSpeech: string,
  includeAlternativeForms: boolean,
  isCompoundOrAcronym: boolean
) {
  if (!includeAlternativeForms || isCompoundOrAcronym || mainPartOfSpeech === "phrasal-verb") return []
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const normalized = raw
    .map((item) => {
      const value = item as {
        word?: unknown
        partOfSpeech?: unknown
        translation?: unknown
        example?: unknown
      }
      const word = normalizeInlineWhitespace(value?.word)
      const partOfSpeech = normalizePartOfSpeech(value?.partOfSpeech)
      const translation = normalizeTranslationText(value?.translation)
      const example = normalizeInlineWhitespace(value?.example)
      const isSameWord = word.toLowerCase() === mainWord.toLowerCase()
      if (!word || !translation || !example) return null
      if (looksLikeNonEnglishExample(example)) return null
      if (isSameWord && partOfSpeech === mainPartOfSpeech) return null
      if (word.includes(" ")) return null
      // Productive hyphenated formations (e.g. rainforest-like) are not
      // stable lexical-family headwords. They are compositional expressions,
      // so including them makes a complete-family view noisy and misleading.
      if (word.includes("-")) return null
      if (partOfSpeech === "idiom" || partOfSpeech === "phrasal-verb" || partOfSpeech === "acronym" || partOfSpeech === "interjection") return null
      if (partOfSpeech === "adjective" && isAdjectiveDegreeVariant(mainWord, word)) return null
      if (partOfSpeech === "noun" && isNounPluralVariant(mainWord, word)) return null
      if (
        partOfSpeech === mainPartOfSpeech &&
        isRegularVerbInflectionVariant(mainWord, word)
      ) return null
      const translationPtBr = normalizePtBrOrthography(translation)
      return { word, partOfSpeech, translation: translationPtBr, example }
    })
    .filter(
      (
        item
      ): item is { word: string; partOfSpeech: string; translation: string; example: string } => Boolean(item)
    )
    // Apply the shared archaic/coherence filter (blocklist + translation patterns + POS coherence).
    .filter((item) => {
      const kept = filterArchaicAlternativeForms([item], mainWord)
      return kept.length > 0
    })
    .filter((item) => {
      // Exact word+POS dedup — prevents the same derivation twice.
      // BUT allow the same word with different POS: "quick" as adjective
      // and "quick" as noun are both valid, distinct dictionary entries.
      const key = `${item.word.toLowerCase()}::${item.partOfSpeech}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  if (normalized.length > 0) return normalized.slice(0, MAX_LEARNER_DERIVATIONS)
  return []
}
function normalizeConjugations(raw: unknown): FlashcardAIResponse["conjugations"] {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Partial<NonNullable<FlashcardAIResponse["conjugations"]>>
  const simplePresent = normalizeSimplePresentConjugation(asTrimmedString(value.simplePresent))
  const simplePast = asTrimmedString(value.simplePast)
  const presentContinuous = normalizeContinuousConjugation(asTrimmedString(value.presentContinuous), "am/is/are")
  const pastContinuous = normalizeContinuousConjugation(asTrimmedString(value.pastContinuous), "was/were")
  const presentPerfect = normalizePerfectConjugation(asTrimmedString(value.presentPerfect), "have/has")
  const pastPerfect = normalizePerfectConjugation(asTrimmedString(value.pastPerfect), "had")
  const availableCount = [simplePresent, simplePast, presentContinuous, pastContinuous, presentPerfect, pastPerfect].filter(Boolean).length
  if (availableCount < 3) return null
  return {
    simplePresent,
    simplePast,
    presentContinuous,
    pastContinuous,
    presentPerfect,
    pastPerfect,
  }
}
function normalizeSimplePresentConjugation(value: string): string {
  const unique = [...new Set(normalizeInlineWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .split(/\s*\/\s*|\s*[,;|]\s*/)
    .map((form) => form
      .replace(/\b(I|you|we|they|he|she|it)\b/gi, " ")
      .replace(/\b(am|is|are|have|has|had)\b/gi, " ")
      .replace(/[^A-Za-z' -]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase())
    .filter(Boolean))]
  if (unique.length === 0) return ""
  // If the IA gave us exactly one form, keep it as-is (it might be the base
  // or the third-person — don't second-guess). Only synthesize the missing
  // half when both are absent and we have a clear base form to derive from.
  if (unique.length === 1) return unique[0]
  // Multiple forms — join the first two with " / " preserving IA order.
  return unique.slice(0, 2).join(" / ")
}
function normalizeContinuousConjugation(value: string, auxiliary: "am/is/are" | "was/were"): string {
  const normalized = normalizeInlineWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(am|is|are|was|were)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  const ingMatch = normalized.match(/\b([A-Za-z'-]+ing(?:\s+[A-Za-z'-]+)*)\b/i)
  return ingMatch?.[1] ? `${auxiliary} ${ingMatch[1].toLowerCase()}` : ""
}
function normalizePerfectConjugation(value: string, auxiliary: "have/has" | "had"): string {
  const participle = normalizeInlineWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(have|has|had)\b/gi, " ")
    .replace(/[\/,;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return participle ? `${auxiliary} ${participle}` : ""
}
function inferVerbTypeFromSimplePast(simplePast: string): "regular" | "irregular" {
  const normalized = simplePast.toLowerCase().trim()
  return normalized.endsWith("ed") || normalized.endsWith("d") ? "regular" : "irregular"
}
function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}
function shouldSuppressUsageAndExample(params: {
  word: string
  partOfSpeech: string
  translation: string
  usageNote: string
  synonymsCount: number
  antonymsCount: number
  alternativeFormsCount: number
  efommMode?: boolean
}): boolean {
  if (params.partOfSpeech === "idiom" || params.partOfSpeech === "acronym") return false
  const note = normalizeInlineWhitespace(params.usageNote)
  const isTrivialFunctionWord =
    /^(the|a|an|of|in|on|at|to|for|with|by|and|or|but|is|are|was|were|be|been|being|do|does|did|have|has|had|i|you|he|she|it|we|they|me|him|her|us|them|my|your|his|its|our|their)$/i.test(
      normalizeForLooseMatch(params.word)
    )
  const noteIsEmpty = note.length === 0
  return noteIsEmpty && isTrivialFunctionWord
}
function normalizeTranslationByLexicalGuards(
  word: string,
  translation: string,
  options?: { partOfSpeech?: string; includeMultipleTranslations?: boolean }
): string {
  void word
  void options
  return normalizeTranslationText(translation)
}
function logRevisionAudit(
  event: "generate" | "revise",
  payload: {
    word: string
    partOfSpeech?: string
    translation: string
    usageNote: string
    example: string
    exampleTranslation?: string
  }
) {
  const note = normalizeInlineWhitespace(payload.usageNote)
  const translation = normalizeInlineWhitespace(payload.translation)
  const example = normalizeInlineWhitespace(payload.example)
  const exampleTranslation = normalizeInlineWhitespace(payload.exampleTranslation ?? "")
  const audit = {
    event,
    word: normalizeInlineWhitespace(payload.word),
    partOfSpeech: payload.partOfSpeech ?? "n/a",
    translationOk: Boolean(translation) && !/[()]/.test(translation),
    contextOk: note.length === 0 || (!/[\n#*]/.test(note) && note.length <= 260),
    exampleOk: Boolean(example) && Boolean(exampleTranslation),
    ts: new Date().toISOString(),
  }
  console.log(`[AI_REVIEW_AUDIT] ${JSON.stringify(audit)}`)
}
function normalizeFlashcardResponse(
  raw: FlashcardAIResponse,
  originalWord: string,
  options: {
    includeConjugations: boolean
    includeAlternativeForms: boolean
    includeMultipleTranslations: boolean
    synonymsLevel: number
    isCompoundOrAcronym: boolean
    efommMode?: boolean
    targetPartOfSpeech?: string
    preferContextualAlternativeTranslation?: boolean
  }
): FlashcardAIResponse {
  const initialNormalizedWord = normalizeInlineWhitespace(raw?.normalizedWord) || normalizeInlineWhitespace(originalWord)
  const requestedTargetPos = options.targetPartOfSpeech
    ? normalizePartOfSpeech(options.targetPartOfSpeech)
    : undefined
  // Do not let a manually supplied or stale single-word "idiom" target bypass
  // the structural guard below.
  const targetPos = requestedTargetPos === "idiom" && !initialNormalizedWord.includes(" ")
    ? undefined
    : requestedTargetPos
  const fallbackResult = inferPartOfSpeechWithAcronymFallback({
    originalWord,
    normalizedWord: initialNormalizedWord,
    rawPartOfSpeech: raw?.partOfSpeech ?? "noun",
    translation: normalizeTranslationText(raw?.translation),
    usageNote: asTrimmedString(raw?.usageNote),
  })
  const rawPartOfSpeech = targetPos ?? fallbackResult.partOfSpeech
  let partOfSpeech = rawPartOfSpeech
  const normalizedWordRaw = rawPartOfSpeech === "acronym" ? fallbackResult.normalizedWord : initialNormalizedWord

  // SAFETY NET: if the IA stripped a derivational suffix from the original
  // word (e.g. "quickly" -> "quick", "happiness" -> "happy"), revert to the
  // original word. The prompt says "normalizedWord is the word as it appears
  // in a learner's dictionary" — derived forms like "quickly" ARE the
  // dictionary entry. Only inflectional suffixes (-s, -ed, -ing, -er, -est)
  // should be stripped (e.g. "houses" -> "house", "running" -> "run").
  const originalLower = normalizeInlineWhitespace(originalWord).toLowerCase()
  const normalizedLower = normalizedWordRaw.toLowerCase()
  let normalizedWord = normalizedWordRaw
  const grammaticalForm = resolveGrammaticalForm(raw?.grammaticalForm, originalLower, partOfSpeech)
  if (originalLower !== normalizedLower) {
    const derivationalSuffixes = ["ly", "ness", "ment", "tion", "sion", "ity", "ful", "less", "ous", "ive", "al", "able", "ible", "ize", "ify", "ism", "ist"]
    const strippedSuffix = originalLower.endsWith(normalizedLower)
      ? originalLower.slice(normalizedLower.length)
      : ""
    if (strippedSuffix && derivationalSuffixes.includes(strippedSuffix)) {
      const reverted = normalizeInlineWhitespace(originalWord)
      if (reverted) normalizedWord = reverted
    }
  }
  if (grammaticalForm !== "base-form" && originalLower) {
    normalizedWord = originalLower
  }
  let translationByPartOfSpeech = filterTranslationChunks(
    raw?.translation,
    options.includeMultipleTranslations,
    partOfSpeech,
    options.preferContextualAlternativeTranslation
  )
  let translation = normalizePtBrOrthography(
    normalizeTranslationByLexicalGuards(normalizedWord, translationByPartOfSpeech, {
      partOfSpeech,
      includeMultipleTranslations: options.includeMultipleTranslations,
    })
  )
  // Keep card tag aligned with the final translation class when model POS drifts.
  if (!targetPos) {
    const alignedPartOfSpeech = realignPartOfSpeechByTranslation(partOfSpeech, translation)
    if (alignedPartOfSpeech !== partOfSpeech) {
      partOfSpeech = alignedPartOfSpeech
      translationByPartOfSpeech = filterTranslationChunks(
        raw?.translation,
        options.includeMultipleTranslations,
        partOfSpeech,
        options.preferContextualAlternativeTranslation
      )
      translation = normalizePtBrOrthography(
        normalizeTranslationByLexicalGuards(normalizedWord, translationByPartOfSpeech, {
          partOfSpeech,
          includeMultipleTranslations: options.includeMultipleTranslations,
        })
      )
    }
  }
  const usageNoteEn = truncateAtWord(normalizeInlineWhitespace(raw?.usageNoteEn || ""))
  const usageNote = normalizeUsageNoteByPartOfSpeech(raw?.usageNote, partOfSpeech, normalizedWord, translation)
  const example = normalizeInlineWhitespace(raw?.example)
  const exampleTranslation = normalizePtBrOrthography(raw?.exampleTranslation)
  const maxRelations = 3
  const synonyms = normalizeLexicalRelations(raw?.synonyms, maxRelations)
  const antonyms = normalizeLexicalRelations(raw?.antonyms, maxRelations)
  const alternativeForms = normalizeAlternativeForms(
    raw?.alternativeForms,
    normalizedWord,
    partOfSpeech,
    options.includeAlternativeForms,
    options.isCompoundOrAcronym
  )
  const isVerbEntry = partOfSpeech === "verb" || partOfSpeech === "phrasal-verb"
  const shouldHaveConjugations = options.includeConjugations && isVerbEntry
  const conjugations = shouldHaveConjugations ? normalizeConjugations(raw?.conjugations) : null
  const verbTypeFromModel = asTrimmedString(raw?.verbType)
  const inferredVerbType = conjugations?.simplePast
    ? inferVerbTypeFromSimplePast(conjugations.simplePast)
    : "irregular"
  const verbType =
    isVerbEntry
      ? verbTypeFromModel === "regular" || verbTypeFromModel === "irregular"
        ? (verbTypeFromModel as "regular" | "irregular")
        : inferredVerbType
      : null
  const _verbReasoning =
    isVerbEntry
      ? normalizeInlineWhitespace(raw?._verbReasoning) ||
        `Passado � ${conjugations?.simplePast ?? "n/a"}. Termina em -ed/-d? ${verbType === "regular" ? "Yes" : "No"}. Tipo: ${verbType}`
      : "n/a"
  const suppressUsageAndExample = shouldSuppressUsageAndExample({
    word: normalizedWord,
    partOfSpeech,
    translation,
    usageNote,
    synonymsCount: synonyms.length,
    antonymsCount: antonyms.length,
    alternativeFormsCount: alternativeForms.length,
    efommMode: options.efommMode,
  })
  const ipaNormalized = normalizeIpa(raw?.ipa)
  const familyKey = normalizeInlineWhitespace(raw?.familyKey).toLowerCase() || normalizedWord.toLowerCase()
  const usageStatus = raw?.usageStatus === "archaic" || raw?.usageStatus === "rare" ? raw.usageStatus : "current"
  return {
    normalizedWord,
    partOfSpeech,
    grammaticalForm,
    translation,
    ipa: ipaNormalized,
    usageNote: suppressUsageAndExample ? "" : usageNote,
    usageNoteEn,
    synonyms,
    antonyms,
    example,
    exampleTranslation,
    alternativeForms,
    familyKey,
    usageStatus,
    _verbReasoning,
    verbType,
    conjugations,
  }
}
function normalizeRevisionResponse(
  raw: FlashcardRevisionResponse,
  options: {
    word: string
    partOfSpeech: string
    includeAlternativeForms: boolean
    synonymsLevel: number
    isCompoundOrAcronym: boolean
    efommMode?: boolean
  }
): FlashcardRevisionResponse {
  const normalizedPartOfSpeech = normalizePartOfSpeech(options.partOfSpeech)
  const normalizedTranslation = normalizeTranslationByLexicalGuards(options.word, normalizeTranslationText(raw?.translation), {
    partOfSpeech: normalizedPartOfSpeech,
    includeMultipleTranslations: normalizeTranslationText(raw?.translation).includes("/"),
  })
  const purifiedTranslation = filterTranslationChunks(
    normalizedTranslation,
    normalizeTranslationText(raw?.translation).includes("/"),
    normalizedPartOfSpeech
  )
  const translation = normalizePtBrOrthography(
    normalizedPartOfSpeech === "acronym" || normalizedPartOfSpeech === "idiom"
      ? pickPrimaryTranslation(purifiedTranslation)
      : purifiedTranslation
  )
  const usageNoteEn = truncateAtWord(normalizeInlineWhitespace(raw?.usageNoteEn || ""))
  const usageNote = normalizeUsageNoteByPartOfSpeech(
    raw?.usageNote,
    normalizedPartOfSpeech,
    normalizeInlineWhitespace(options.word),
    translation
  )
  const synonyms = normalizeLexicalRelations(raw?.synonyms, 3)
  const antonyms = normalizeLexicalRelations(raw?.antonyms, 3)
  const example = normalizeInlineWhitespace(raw?.example)
  const exampleTranslation = normalizePtBrOrthography(raw?.exampleTranslation)
  const alternativeForms = normalizeAlternativeForms(
    raw?.alternativeForms,
    normalizeInlineWhitespace(options.word),
    normalizedPartOfSpeech,
    options.includeAlternativeForms,
    options.isCompoundOrAcronym
  )
  const suppressUsageAndExample = shouldSuppressUsageAndExample({
    word: options.word,
    partOfSpeech: normalizedPartOfSpeech,
    translation,
    usageNote,
    synonymsCount: synonyms.length,
    antonymsCount: antonyms.length,
    alternativeFormsCount: alternativeForms.length,
    efommMode: options.efommMode,
  })
  const ipaNormalized = normalizeIpa(raw?.ipa)
  return {
    grammaticalForm: normalizeGrammaticalForm(raw?.grammaticalForm),
    translation,
    ipa: ipaNormalized,
    usageNote: suppressUsageAndExample ? "" : usageNote,
    usageNoteEn,
    synonyms,
    antonyms,
    example,
    exampleTranslation,
    alternativeForms,
  }
}
export async function reviseFlashcardByTranslation(
  input: {
    word: string
    partOfSpeech: string
    grammaticalForm?: string
    translation: string
    usageNote?: string
    example?: string
    exampleTranslation?: string
    synonyms?: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
    antonyms?: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
    alternativeForms?: { word: string; partOfSpeech: string; translation: string; example: string }[]
    conjugations?: Record<string, string> | null
    verbType?: "regular" | "irregular" | null
    falseCognate?: { isFalseCognate: boolean; warning: string }
    synonymsLevel?: number
    includeSynonymsAntonyms?: boolean
    includeAlternativeForms?: boolean
    includeMultipleTranslations?: boolean
    efommMode?: boolean
  },
  model: string = DEFAULT_AI_MODEL
): Promise<FlashcardRevisionResponse> {
  const includeSynonymsAntonyms = input.includeSynonymsAntonyms ?? true
  const synonymsLevel = includeSynonymsAntonyms
    ? Math.max(1, Math.min(3, input.synonymsLevel ?? 3))
    : 0
  const includeAlternativeForms = input.includeAlternativeForms ?? true
  const includeMultipleTranslations = input.includeMultipleTranslations ?? true
  const isCompoundOrAcronym = input.word.trim().includes(" ") || isAcronymCandidate(input.word)
  console.log(`[OpenRouter] Revising ${model} for: ${input.word}`)
  const synonymsInstructionRevise = synonymsLevel > 0
    ? `Return up to ${synonymsLevel} real synonyms and ${synonymsLevel} real antonyms of the same POS and meaning. Empty arrays only when nothing fits.`
    : `Return "synonyms" as [] and "antonyms" as []. Do not invent weak or unrelated words.`
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a lexicographer revising an English-Portuguese flashcard entry for Brazilian learners. Output ONLY valid JSON, no markdown or commentary.
Keep responses tight. Portuguese text MUST follow the 2009 Orthographic Agreement. All other text in English. Formal, neutral, dictionary-style tone.
Revise the incoming entry and return:
- "grammaticalForm": preserve or correct one of "base-form", "comparative", "superlative", "plural", "past", "past-participle", "present-participle", "third-person-singular". Infer it from the exact written form and its example.
- "translation": ${includeMultipleTranslations ? "up to 2 natural Brazilian Portuguese equivalents separated by ' / '" : "exactly one natural Brazilian Portuguese equivalent"}.
- "ipa": IPA transcription of the word in American English (no surrounding slashes/brackets). If unreliable, return an empty string.
- "usageNoteEn" (English): one concise dictionary-style sentence (max 140 chars) capturing the essential meaning.
- "usageNote" (Brazilian Portuguese): a faithful Portuguese translation of usageNoteEn, same length and content. No exclamations, no "Cuidado!"/"Atencao!".
- "example": one natural American English sentence that perfectly illustrates the chosen POS.
- "exampleTranslation": Brazilian Portuguese translation of the example.
- "synonyms", "antonyms": ${synonymsInstructionRevise}
- "alternativeForms": same derivational forms rule as generation; if partOfSpeech is "phrasal-verb", always return [].
- "verbType": "regular" | "irregular" | null.
- "conjugations": if partOfSpeech is "verb" or "phrasal-verb", include all 6 tenses and preserve every particle in every form (simplePresent "base / thirdPersonSingular", simplePast, presentContinuous, pastContinuous, presentPerfect, pastPerfect). Otherwise null.`
    },
    {
      role: "user",
      content: JSON.stringify({
        word: input.word,
        partOfSpeech: input.partOfSpeech,
        grammaticalForm: input.grammaticalForm,
        translation: input.translation,
        usageNote: input.usageNote,
        example: input.example,
        exampleTranslation: input.exampleTranslation,
        synonyms: input.synonyms,
        antonyms: input.antonyms,
        conjugations: input.conjugations,
        verbType: input.verbType,
        falseCognate: input.falseCognate,
      }),
    },
  ]
  const raw = await callOpenRouter<FlashcardRevisionResponse>(
    messages,
    model,
    { type: "json_object" },
    { temperature: 0.2 }
  )
  const normalized = normalizeRevisionResponse(raw, {
    word: input.word,
    partOfSpeech: input.partOfSpeech,
    includeAlternativeForms,
    synonymsLevel,
    isCompoundOrAcronym,
    efommMode: input.efommMode,
  })
  return normalized
}
function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
function extractBalancedJsonValue(raw: string, startIndex: number): string | null {
  const startChar = raw[startIndex]
  if (startChar !== "{" && startChar !== "[") return null
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let i = startIndex; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === "\\") {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") {
      stack.push("}")
      continue
    }
    if (ch === "[") {
      stack.push("]")
      continue
    }
    if (ch === "}" || ch === "]") {
      const expected = stack[stack.length - 1]
      if (expected !== ch) return null
      stack.pop()
      if (stack.length === 0) {
        return raw.slice(startIndex, i + 1)
      }
    }
  }
  return null
}
function parseJsonContent<T>(raw: string): T {
  const normalized = raw.replace(/^\uFEFF/, "").trim()
  const direct = tryParseJson<T>(normalized)
  if (direct !== null) return direct
  const fencedBlocks = normalized.matchAll(/``(?:json)?\s*([\s\S]*?)\s*``/gi)
  for (const match of fencedBlocks) {
    const block = (match[1] ?? "").trim()
    if (!block) continue
    const parsed = tryParseJson<T>(block)
    if (parsed !== null) return parsed
  }
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch !== "{" && ch !== "[") continue
    const candidate = extractBalancedJsonValue(normalized, i)
    if (!candidate) continue
    const parsed = tryParseJson<T>(candidate)
    if (parsed !== null) return parsed
  }
  const preview = normalized.slice(0, 240).replace(/\s+/g, " ")
  throw new Error("Resposta da IA nao veio em JSON valido. Preview: " + preview)
}
async function callOpenRouter<T>(
  messages: OpenRouterMessage[],
  model: string = DEFAULT_AI_MODEL,
  responseFormat?: { type: "json_object" },
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY n�o configurada no servidor.")
  }
  const requestedModel = model
  const activeModel = resolveGraniteModel(requestedModel)
  const requestStartedAt = Date.now()
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      // Compute referer safely for both browser and server environments without relying on the process identifier
      "HTTP-Referer":
        (typeof window !== "undefined" && window.location?.origin) ||
        ((globalThis as any).process?.env?.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
      "X-OpenRouter-Title": "Meu App de Flashcards",
    },
    signal: AbortSignal.timeout(options?.timeoutMs ?? 45_000),
    body: JSON.stringify({
      model: activeModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1_600,
      provider: {
        sort: "throughput",
      },
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  })
  if (!response.ok) {
    const rawError = await response.text()
    let message = `Erro na chamada da API do OpenRouter (status ${response.status})`
    try {
      const parsed = JSON.parse(rawError) as { error?: { message?: string } }
      if (parsed?.error?.message) {
        message = parsed.error.message
      }
    } catch {
      if (rawError.trim()) {
        message = message + ": " + rawError.slice(0, 300)
      }
    }
    throw new Error(message)
  }
  const data: OpenRouterResponse = await response.json()
  recordGranitePerformance(requestedModel, Date.now() - requestStartedAt, data)
  const content = data.choices[0].message.content
  if (!content) {
    throw new Error("Resposta da IA vazia")
  }
  return parseJsonContent<T>(content)
}
export interface FlashcardAIResponse {
  normalizedWord: string
  partOfSpeech: string
  grammaticalForm?: string
  translation: string
  ipa?: string
  usageNote?: string
  usageNoteEn?: string
  synonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  antonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  example: string
  exampleTranslation?: string
  alternativeForms: {
    word: string
    partOfSpeech: string
    translation: string
    example: string
  }[]
  familyKey?: string
  usageStatus?: "current" | "rare" | "archaic"
  /** Internal marker: the server already ran its derivation safety pipeline. */
  derivationsValidated?: boolean
  _verbReasoning?: string
  verbType?: "regular" | "irregular" | null
  conjugations?: {
    simplePresent: string
    simplePast: string
    presentContinuous: string
    pastContinuous: string
    presentPerfect: string
    pastPerfect: string
  } | null
}
export interface GenerateFlashcardOptions {
  includeSynonymsAntonyms?: boolean
  synonymsLevel?: number
  includeConjugations?: boolean
  includeAlternativeForms?: boolean
  includeUsageNote?: boolean
  includeIpa?: boolean
  includeMultipleTranslations?: boolean
  /** ReadLab: prefer a second equivalent only when interchangeable in context. */
  preferContextualAlternativeTranslation?: boolean
  efommMode?: boolean
  targetPartOfSpeech?: string
  /** POS already stored for this exact headword; generation should prefer a different real sense. */
  existingPartsOfSpeech?: string[]
  /** Imported source sense; verified by the generator before it is used. */
  preferredTranslation?: string
  /** Sentence or nearby passage in which a ReadLab selection occurred. */
  sourceContext?: string
  /** Preserve an inflected surface form selected in ReadLab instead of lemmatizing it. */
  preserveSourceForm?: boolean
  /** Generate a compact learner example for the contextual ReadLab sense. */
  conciseSourceExample?: boolean
}
export interface FlashcardRevisionResponse {
  grammaticalForm?: string
  translation: string
  ipa?: string
  usageNote: string
  usageNoteEn?: string
  synonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  antonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  example: string
  exampleTranslation?: string
  alternativeForms: {
    word: string
    partOfSpeech: string
    translation: string
    example: string
  }[]
}
export interface WordPartOfSpeechValidationResponse {
  valid: boolean
  reason: string
  confidence: "low" | "medium" | "high"
  usageStatus: "current" | "rare" | "archaic"
  grammaticalForm?: string
}
export async function validateWordPartOfSpeech(
  input: { word: string; partOfSpeech: string; translation?: string; grammaticalForm?: string },
  model: string = DEFAULT_AI_MODEL
): Promise<WordPartOfSpeechValidationResponse> {
  const word = normalizeInlineWhitespace(input.word)
  const partOfSpeech = normalizePartOfSpeech(input.partOfSpeech)
  if (!word) {
    return {
      valid: false,
      reason: "Palavra vazia.",
      confidence: "high",
      usageStatus: "current",
    }
  }
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a strict lexical validator for contemporary American English usage.
Return ONLY JSON with: {"valid": boolean, "reason": string, "confidence": "low|medium|high", "usageStatus": "current|rare|archaic", "grammaticalForm":"base-form|comparative|superlative|plural|past|past-participle|present-participle|third-person-singular"}.
Validation policy:
- Decide whether the exact word can function as the requested part of speech in a real dictionary sense.
- Verify grammaticalForm independently from partOfSpeech. Infer it from the exact written form when missing. When the caller supplies grammaticalForm and it does not match the written form, return valid=false and return the correctly identified grammaticalForm; never silently accept or replace the caller's choice.
- Treat "phrasal-verb" as a distinct verbal class: accept it only for a verb plus one or more particles/prepositions functioning as one lexical unit. Do not confuse it with a general idiom, collocation, or ordinary multi-word phrase.
- If a Portuguese translation is supplied, it must match the requested POS and the exact English sense. Reject a noun tagged with an adjective translation, a verb tagged with a noun translation, and analogous mismatches.
- Accept archaic, obsolete, poetic-only, ultra-rare, dictionary-edge, or historical-only usages only when the POS is real; set usageStatus="archaic" and explain the register. A non-existent POS remains invalid.
- Reject obvious misspellings when class would only work with another spelling.
- Accept polysemy only when the usage is genuinely current and teachable.
- Keep "reason" short and objective, in pt-BR.`,
    },
    {
      role: "user",
      content: JSON.stringify({ word, partOfSpeech, grammaticalForm: input.grammaticalForm, translation: normalizeTranslationText(input.translation) || undefined }),
    },
  ]
  const raw = await callOpenRouter<WordPartOfSpeechValidationResponse>(
    messages,
    model,
    { type: "json_object" },
    { temperature: 0.1, maxTokens: 220, timeoutMs: 12_000 }
  )
  const confidence =
    raw?.confidence === "low" || raw?.confidence === "medium" || raw?.confidence === "high"
      ? raw.confidence
      : "medium"
  const usageStatus = raw?.usageStatus === "archaic" || raw?.usageStatus === "rare" ? raw.usageStatus : "current"
  return {
    valid: Boolean(raw?.valid),
    reason: normalizeInlineWhitespace(raw?.reason) || "Sem justificativa.",
    confidence,
    usageStatus,
    grammaticalForm: resolveGrammaticalForm(raw?.grammaticalForm, word, partOfSpeech),
  }
}

function alternativeKey(form: Pick<FlashcardAIResponse["alternativeForms"][number], "word" | "partOfSpeech">): string {
  return `${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`
}

async function validateSameSpellingAlternativeForms(
  baseWord: string,
  basePartOfSpeech: string,
  forms: FlashcardAIResponse["alternativeForms"]
): Promise<Set<string>> {
  const candidates = forms.filter((form) =>
    normalizeInlineWhitespace(form.word).toLowerCase() === normalizeInlineWhitespace(baseWord).toLowerCase() &&
    normalizePartOfSpeech(form.partOfSpeech) !== normalizePartOfSpeech(basePartOfSpeech)
  )
  if (candidates.length === 0) return new Set()

  const results = await Promise.all(candidates.map(async (form) => {
    try {
      const review = await validateWordPartOfSpeech({
        word: form.word,
        partOfSpeech: form.partOfSpeech,
        translation: form.translation,
      })
      return review.valid && review.usageStatus === "current" ? alternativeKey(form) : null
    } catch {
      // Fail closed only for this exceptional POS shift. A questionable
      // conversion must not enter a learner deck merely because its verifier
      // was unavailable.
      return null
    }
  }))
  return new Set(results.filter((key): key is string => Boolean(key)))
}

export async function generateFlashcardData(
  word: string,
  model: string = DEFAULT_AI_MODEL,
  options?: GenerateFlashcardOptions
): Promise<FlashcardAIResponse> {
  const includeSynonymsAntonyms = options?.includeSynonymsAntonyms ?? true
  const synonymsLevel = includeSynonymsAntonyms
    ? Math.max(1, Math.min(3, options?.synonymsLevel ?? 3))
    : 0
  const includeConjugations = options?.includeConjugations ?? true
  const includeAlternativeForms = options?.includeAlternativeForms ?? true
  // includeUsageNote is always treated as true � both fields are always generated
  const includeIpa = options?.includeIpa ?? true
  const includeMultipleTranslations = options?.includeMultipleTranslations ?? true
  const preferContextualAlternativeTranslation = options?.preferContextualAlternativeTranslation === true
  const efommMode = options?.efommMode ?? false
  const requestedTargetPartOfSpeech = options?.targetPartOfSpeech
  const existingPartsOfSpeech = [...new Set(
    (options?.existingPartsOfSpeech ?? [])
      .map((part) => normalizePartOfSpeech(part))
      .filter(Boolean)
  )]
  const requestedNormalizedPos = normalizePartOfSpeech(requestedTargetPartOfSpeech || "")
  const targetPartOfSpeech =
    (requestedNormalizedPos === "idiom" || requestedNormalizedPos === "phrasal-verb") && !normalizeInlineWhitespace(word).includes(" ")
      ? undefined
      : requestedTargetPartOfSpeech
  const preferredTranslation = normalizeInlineWhitespace(options?.preferredTranslation || "")
  const sourceContext = normalizeInlineWhitespace(options?.sourceContext || "").slice(0, 700)
  const preserveSourceForm = options?.preserveSourceForm === true
  const conciseSourceExample = options?.conciseSourceExample === true && Boolean(sourceContext)
  console.log(`[OpenRouter] Calling ${model} for word: ${word}`)
  const efommInstruction = efommMode
    ? "\n\nEFOMM/MARITIME MODE: This word may have a maritime/naval/technical meaning. Prefer that domain meaning when it is the most useful for a Brazilian learner studying for EFOMM. If you pick the maritime sense, briefly mention the everyday meaning in usageNote."
    : ""
  const translationInstruction = preferContextualAlternativeTranslation
    ? `Return a second pt-BR equivalent separated by " / " ONLY when it can naturally replace the primary translation in this exact SOURCE CONTEXT without changing meaning, grammar, degree, register, or nuance. If no truly interchangeable alternative exists, return ONE translation. Never pad the answer with a merely related word.`
    : includeMultipleTranslations
    ? `Return "translation" with up to 2 natural Brazilian Portuguese equivalents separated by " / ". Choose the most common, learner-friendly options.`
    : `Return "translation" with exactly one natural Brazilian Portuguese equivalent.`
  const usageNoteInstruction = `Always produce BOTH fields, as a short DICTIONARY ENTRY (not a paragraph, not a usage guide):
- "usageNoteEn" (English): ONE concise sentence that captures the essential meaning of the word for the chosen part of speech, like a learner's dictionary entry. Formal, neutral tone. Max 140 characters.
- "usageNote" (Brazilian Portuguese): a faithful Portuguese translation of usageNoteEn, same length and content. Do NOT add extra information, register notes, warnings, or exclamations. Do NOT use "Cuidado!", "Atencao!", or similar.
Both fields are ALWAYS returned, even for very common words.`
  const ipaInstruction = includeIpa
    ? `Return "ipa" with the standard International Phonetic Alphabet transcription of the normalizedWord in American English. For multi-word idiom and phrasal-verb entries, transcribe every word in order. Return ONLY the IPA string (no surrounding slashes, brackets, or the word itself). If unreliable, return an empty string.`
    : `Return "ipa" as an empty string.`
  const synonymsInstruction = synonymsLevel > 0
    ? `Provide up to ${synonymsLevel} real synonyms and ${synonymsLevel} real antonyms of the SAME part of speech and meaning.
- "synonyms": [{"word", "type"}] where type is "literal", "figurative", "slang", or "abstract".
- "antonyms": same shape, up to ${synonymsLevel} items.
- Only return [] if there is genuinely no real synonym or antonym for the chosen sense.`
    : `Return "synonyms" as [] and "antonyms" as []. Do not invent weak or unrelated words.`
let alternativeFormsInstruction = includeAlternativeForms
    ? `If the word has common lexical-family forms (e.g., beautiful -> beautifully, beauty), include the COMPLETE set of real, common dictionary headwords (not just 2). DERIVATION RULES: (a) Each form's "word" must be the actual English spelling of that lexical form. (b) The derived word MUST be a REAL, commonly used English word - never invent forms. If you are not 100% sure it exists, do NOT include it. (c) Only include POS that the word genuinely, commonly functions as. For example: "rainforest" has NO alternative POS (return []). "beauty" -> "beautiful" (adj) is valid. "keep" -> "keep" (noun) is valid polysemy. (d) The derived word MUST share the same root as the base word (genuine morphological derivation). "almost" is NOT a derivation of "alive" (different roots). (e) For translation, provide up to 2 Brazilian Portuguese equivalents separated by " / ". (f) Do NOT include grammar inflections: plurals, verb tenses, -ing forms, or adjective comparatives/superlatives (quick -> quicker/quickest are NOT alternative forms). Also exclude ad hoc productive hyphenated formations such as "rainforest-like". If no valid derivational forms exist, return []. MANDATORY EXCLUSIONS — do NOT include these even if they technically exist in some dictionary: "quick" as a noun ("the quick" = live flesh — archaic, useless for learners); "alive" as a noun; "dead" as a verb; any sense marked as archaic, historical, poetic, or only found in set phrases. Only include what a Cambridge or Oxford LEARNER'S Dictionary lists as a main or common secondary entry for general English learners.`
    : `Return "alternativeForms" as an empty array.`
  if (includeAlternativeForms) {
    alternativeFormsInstruction += ` HARD OUTPUT CAP: return no more than ${MAX_LEARNER_DERIVATIONS} forms, ordered by learner usefulness. A bare -ing, past, plural, comparative, or superlative inflection is never a derivation. Keep an -ing noun only when it has its own non-gerund Portuguese noun meaning.`
  }
  const conjugationInstruction = includeConjugations
    ? `If partOfSpeech is "verb" or "phrasal-verb": include verbType ("regular" | "irregular") and conjugations object with all 6 tenses, preserving every particle in every form. Formats: simplePresent "base / thirdPersonSingular"; simplePast "past"; presentContinuous "am/is/are + -ing"; pastContinuous "was/were + -ing"; presentPerfect "have/has + past participle"; pastPerfect "had + past participle". Include "_verbReasoning" with the type justification.`
    : `Set verbType to null and conjugations to null. Do NOT generate verb conjugation data.`
  const posLockInstruction = targetPartOfSpeech
    ? `The requested partOfSpeech is "${targetPartOfSpeech}". Keep it only when that exact word+POS is a real dictionary sense. If it is archaic, preserve the POS but set usageStatus="archaic" and generate the translation, example, and context for THAT archaic sense. If it does not exist at all, return the real current POS instead; never invent a current meaning to satisfy the request.`
    : ""
  const preferredSenseInstruction = preferredTranslation
    ? `SOURCE SENSE CANDIDATE: A fast lookup proposes the Portuguese translation "${preferredTranslation}". Treat it only as a weak hint. Verify it against SOURCE CONTEXT and replace it whenever it is broad, awkward, incomplete, or does not fit the translated example naturally. Never preserve it merely because it was supplied.`
    : ""
  const sourceUsageInstruction = sourceContext
    ? `SOURCE CONTEXT: "${sourceContext}". Determine the selected word's part of speech and meaning from this actual sentence, not from its most common unrelated sense.${preserveSourceForm ? ` Preserve the selected surface form "${normalizeInlineWhitespace(word).toLowerCase()}" as normalizedWord and use that exact form naturally in the example. It may be an inflected form; keep familyKey linked to the dictionary lemma.` : ""}${conciseSourceExample ? ` Write a NEW, self-contained learner example of 6 to 12 words for this same sense. Do not copy the full source sentence. Keep the selected surface form exactly and translate the short example faithfully.` : ""}`
    : preserveSourceForm
      ? `Preserve the selected surface form "${normalizeInlineWhitespace(word).toLowerCase()}" as normalizedWord and use that exact form naturally in the example. Keep familyKey linked to its dictionary lemma.`
      : ""
  const unusedPartOfSpeechInstruction = !targetPartOfSpeech && existingPartsOfSpeech.length > 0
    ? `EXISTING CARDS FOR THIS EXACT HEADWORD: ${existingPartsOfSpeech.join(", ")}. Choose a DIFFERENT real, common, modern partOfSpeech for this same spelling. Generate translation, usageNote, usageNoteEn, synonyms, antonyms, example, exampleTranslation, IPA and verb data from scratch for that NEW part of speech and keep every field semantically consistent with it. Do not repeat any listed partOfSpeech merely because it is the most common sense. If this exact headword has no other genuine learner-useful part of speech, return its correct existing partOfSpeech unchanged; the client will treat it as a true duplicate. Never invent a rare or invalid class just to avoid duplication.`
    : ""
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a professional lexicographer building an English-Portuguese flashcard for Brazilian learners, in the style of the Cambridge Learner's Dictionary. Output ONLY a valid JSON object - no markdown, no code blocks, no commentary.

Portuguese text MUST follow the 2009 Orthographic Agreement. All other text in English. Keep responses tight; prefer fewer words over more.
${efommInstruction}
${posLockInstruction}
${preferredSenseInstruction}
${sourceUsageInstruction}
${unusedPartOfSpeechInstruction}

ROLE: You are a DICTIONARY EDITOR, not a creative writer. You do NOT invent forms, meanings, translations, or derivations. If something does not exist as a real, commonly-used English word or usage, do NOT include it. Always verify against your internal knowledge of English lexicography.

FIELDS:
1) normalizedWord, partOfSpeech, grammaticalForm
- normalizedWord preserves the exact valid English form submitted by the user. Do not lemmatize inflections: "houses", "running", "faster", and "greatest" stay written that way. Put the dictionary lemma in familyKey instead.
- CRITICAL: Do NOT change spelling based on POS or grammaticalForm. Correct only an obvious misspelling.
- Choose ONE POS from: verb | phrasal-verb | noun | adjective | adverb | preposition | conjunction | interjection | acronym | idiom.
- "grammaticalForm" is independent from POS and MUST be one of: "base-form", "comparative", "superlative", "plural", "past", "past-participle", "present-participle", "third-person-singular". Use the exact written form and SOURCE CONTEXT when available. Examples: greatest=adjective+superlative; children=noun+plural; went=verb+past; written=verb+past-participle; running=verb+present-participle. Never replace partOfSpeech with a grammatical form.
- "phrasal-verb" for a lexical verb formed by a verb plus one or more particles/prepositions (e.g., "put off", "run out of", "look up"). It remains verbal and must receive verbType and conjugations.
- "idiom" only for a genuinely idiomatic multi-word expression that is not structurally a phrasal verb (e.g., "kick the bucket", "piece of cake"). A single English token is never an idiom or phrasal-verb. "acronym" is for established abbreviations.
- Fix obvious misspellings, hyphenation, and bare infinitives.
- POS RULES (follow strictly - this is the #1 source of errors):
  (a) Pick the MOST COMMON, EVERYDAY part of speech for the word in a learner's dictionary. NOT the rare one. NOT the obscure one.
  (b) MORPHOLOGICAL CLUES — apply these as STRONG HINTS before (c)-(g):
      - Words ending in "-ly" USUALLY adverbs: quickly, happily, slowly, carefully, easily. BUT some "-ly" words are adjectives (friendly, lovely, lonely, costly, motherly, holy, silly). Distinguish: if it modifies a verb/adjective/adverb → adverb; if it describes a noun → adjective.
      - Words ending in "-ness", "-ment", "-tion", "-ity", "-ism" → noun.
      - Words ending in "-ful", "-less", "-ous", "-ive", "-al", "-able" → adjective.
      - Words ending in "-ize", "-ify" → verb.
  (c) "alive" = ADJECTIVE (not noun). "almost" = ADVERB (not adjective). "beauty" = NOUN. "beautiful" = ADJECTIVE. "rainforest" = NOUN. "fast" = ADJECTIVE or ADVERB (pick the most common everyday sense).
  (d) If the word is primarily an ACTION or STATE (keep, make, run, think, become), choose "verb".
  (e) If the word is primarily a THING, CONCEPT, or ENTITY (time, beauty, house), choose "noun".
  (f) If the word describes a QUALITY or ATTRIBUTE (beautiful, fast, happy), choose "adjective".
  (g) If the word modifies a verb, adjective, or adverb (quickly, almost, very), choose "adverb".
  (g) For words that exist as BOTH verb and noun (keep, love, play, work), use the translation as the deciding signal: if the Portuguese translation is a verb form (ends in -ar/-er/-ir), choose "verb"; if it is a noun phrase, choose "noun".
  (h) NEVER classify a word as a POS that is rare, obscure, or only found in specialized dictionaries. Only use POS that reflect common, everyday usage.
2) translation
${translationInstruction}
- "idiom"/"acronym" -> single form only, NO slashes. A "phrasal-verb" follows verb translation rules and may have up to two translations separated by " / ".
- The translation MUST match the chosen partOfSpeech. If POS is "verb" or "phrasal-verb", translation must be a Brazilian Portuguese verb (infinitive form or a natural verbal phrase). If POS is "noun", translation must be a noun phrase. If POS is "adjective", translation must be an adjective. If POS is "adverb", translation must be an adverb or adverbial phrase. Reject mismatches before outputting.
- TRANSLATION QUALITY: Act as a learner's dictionary. Choose the MOST common, practical, everyday Brazilian Portuguese equivalent. Avoid archaic, obscure, overly technical, or historical translations. If a word has a very obscure second meaning, ONLY include the common meaning.
3) usageNote + usageNoteEn (DICTIONARY ENTRY STYLE)
${usageNoteInstruction}
3b) ipa (INTERNATIONAL PHONETIC ALPHABET)
${ipaInstruction}
4) synonyms, antonyms
${synonymsInstruction}
- ALL synonyms and antonyms MUST share the EXACT same partOfSpeech as the main word. Do NOT mix parts of speech (e.g., do not give an adjective as a synonym for a verb).
- Do NOT include the main word itself or a different inflection of it as a synonym/antonym.
- Do NOT include rare or obscure synonyms. Only common, learner-friendly ones.
5) example, exampleTranslation
- ONE natural American English sentence that perfectly illustrates the chosen POS and grammaticalForm. Never empty.
- The example sentence MUST use normalizedWord exactly in that form and POS.
- exampleTranslation is the natural Brazilian Portuguese translation. The translation must reflect the SAME meaning and POS relationship.
6) alternativeForms
${alternativeFormsInstruction}
- If the main partOfSpeech is "phrasal-verb", alternativeForms MUST be []. Do not convert lexicalized nouns such as "takeover" or "turnout" into derivations of the phrasal-verb card.
- CRITICAL DERIVATION RULES (the #2 source of errors after POS):
  (a) Each form's "word" MUST be a REAL English word that genuinely exists in a learner's dictionary (Cambridge, Oxford, Merriam-Webster). If you are not 100% sure the word exists, do NOT include it.
  (b) The derived word MUST share the same root as the base word through lexical derivation (suffixation such as ness/ly/ful/less/able/tion/ity, prefixation such as un-/in-/dis-), OR a polyseme in a different POS that the SAME lexeme genuinely functions as in COMMON, EVERYDAY English. Do NOT include grammar inflections: plurals, past forms, -ing forms, or comparatives/superlatives.
  (c) "almost" is NOT a derivation of "alive" (different roots). "almost" as an adjective does NOT exist. "alivenees" is NOT a real word.
  (d) Only include POS that the word GENUINELY, COMMONLY functions as in a learner's dictionary.
  (e) EACH derivation's translation MUST match THAT derivation's POS, not the main word's POS. For example: if "quick" is listed as a noun derivation of "quickly", the translation must be a Portuguese NOUN (e.g. "carne viva / âmago"). If "quick" is listed as an adjective derivation, the translation must be an adjective (e.g. "rápido / veloz"). Each entry is independent — its translation must match its own POS. NEVER mix POS across entries (e.g. do not give "rápido" as the translation for "quick" when it's tagged as noun).
  (f) Aim for COMPLETENESS within real derivations: if the word has 5 real derivations in a Cambridge dictionary, list all 5 (up to a reasonable cap). Do not truncate to 2 if more exist.
  Include up to 8 common learner-family forms. For example, the modern family of the adjective "quick" includes "quickly" (adverb), "quickness" (noun), and "quicken" (verb); the noun sense of "quick" is a separate archaic sense and is not a current derivation.
  (g) If no valid derivational forms exist (e.g., "rainforest"), return [].
7) lexical family and register
- "familyKey" is the lowercase dictionary headword for the morphological family. Examples: quick, quickly, quicken and quickness use "quick"; beauty, beautiful and beautifully use "beauty". For a word without common derivations, use normalizedWord itself.
- "usageStatus" is "current" for normal modern learner usage, "rare" for an uncommon but current sense, and "archaic" only for obsolete, historical, or set-phrase-only usage. Never present an archaic POS as current.
8) verb
${conjugationInstruction}
CROSS-FIELD COHERENCE (mandatory):
Before returning, internally verify each field and fix any mistakes:
1. POS vs translation: Does the translation match the POS? If POS is "adverb", the translation MUST be an adverb (e.g. "rapidamente", not "rápido"). If POS is "adjective", the translation MUST be an adjective (e.g. "rápido", not "rapidamente"). If POS is "verb", the translation MUST be a verb (e.g. "correr"). If POS is "noun", the translation MUST be a noun (e.g. "corrida"). If they don't match, fix BOTH to be consistent — pick the POS that the translation actually represents.
2. POS vs example: Does the example use the word as the chosen POS? If POS is "adverb", the word must function as an adverb in the example (modifying a verb/adjective/adverb). If POS is "adjective", the word must function as an adjective (modifying a noun).
3. alternativeForms coherence: For EACH entry in alternativeForms, verify:
   - Does the derivation exist in a learner's dictionary? If not, remove it.
   - Does it share the same root as the main word? If not, remove it.
   - Does the derivation's translation match its OWN partOfSpeech?
     * If derivation partOfSpeech is "noun" → translation MUST be a Portuguese NOUN PHRASE (e.g. "guarda / custódia", "rapidez", "manutenção"). NEVER a bare verb infinitive (manter, guardar, correr, etc.).
     * If derivation partOfSpeech is "verb" → translation MUST be a Portuguese verb INFINITIVE (ending in -ar/-er/-ir, e.g. "manter", "guardar", "correr").
     * If derivation partOfSpeech is "adjective" → translation MUST be a Portuguese adjective (e.g. "rápido", "belo").
     * If derivation partOfSpeech is "adverb" → translation MUST be a Portuguese adverb (e.g. "rapidamente", "belamente").
   - EXAMPLE of a WRONG alternativeForms entry: word="keep", partOfSpeech="noun", translation="manter / guardar" → WRONG (those are verb infinitives). Correct translation for "keep" as noun: "guarda / custódia" (a castle keep) or "sustento" (earn one's keep).
4. translation vs exampleTranslation: Do they describe the same meaning and POS?
CRITICAL: The "translation" field MUST be the Portuguese equivalent of the SPECIFIC meaning used in the "example" sentence. For example, if "spike" is used in the example as "to increase suddenly" (not "to pierce"), the translation must be "aumentar bruscamente / disparar", NOT "perfurar / espetar". Always match the translation to the example's context.
OUTPUT (return ONLY this JSON, nothing else):
{
  "normalizedWord": "...",
  "partOfSpeech": "verb|phrasal-verb|noun|adjective|adverb|preposition|conjunction|interjection|acronym|idiom",
  "grammaticalForm": "base-form|comparative|superlative|plural|past|past-participle|present-participle|third-person-singular",
  "translation": "...",
  "ipa": "...",
  "usageNote": "...",
  "usageNoteEn": "...",
  "synonyms": [{"word": "...", "type": "literal|figurative|slang|abstract"}],
  "antonyms": [{"word": "...", "type": "literal|figurative|slang|abstract"}],
  "example": "...",
  "exampleTranslation": "...",
  "alternativeForms": [{"word": "...", "partOfSpeech": "...", "translation": "...", "example": "..."}],
  "familyKey": "...",
  "usageStatus": "current|rare|archaic",
  "_verbReasoning": "...",
  "verbType": "regular|irregular|null",
  "conjugations": {"simplePresent": "...", "simplePast": "...", "presentContinuous": "...", "pastContinuous": "...", "presentPerfect": "...", "pastPerfect": "..."} | null
}`,
    },
    {
      role: "user",
      content: word,
    },
  ]
  const raw = await callOpenRouter<FlashcardAIResponse>(
    messages,
    model,
    { type: "json_object" },
    { temperature: 0.2, maxTokens: 1_000, timeoutMs: 45_000 }
  )
  // `isAcronymCandidate` is intentionally permissive for POS inference, but
  // it must not suppress lexical enrichment: ordinary short words such as
  // "quick" or "ship" can have few vowels. Only an explicitly uppercase
  // token is excluded from word-family generation here.
  const isCompoundOrAcronym = word.trim().includes(" ") || /^[A-Z0-9]{2,8}$/.test(word.trim())
  let normalized = normalizeFlashcardResponse(raw, word, {
    includeConjugations,
    includeAlternativeForms,
    includeMultipleTranslations,
    preferContextualAlternativeTranslation,
    synonymsLevel,
    isCompoundOrAcronym,
    efommMode,
    targetPartOfSpeech,
  })
  if (preserveSourceForm) {
    normalized = { ...normalized, normalizedWord: normalizeInlineWhitespace(word).toLowerCase() }
  }
  if (conciseSourceExample) {
    try {
      const contextualRevision = await callOpenRouter<{
        translation?: string
        example?: string
        exampleTranslation?: string
        usageNote?: string
        usageNoteEn?: string
      }>(
        [
          {
            role: "system",
            content: `You are the final contextual-coherence editor for an English/pt-BR learner card. Return ONLY JSON with translation, example, exampleTranslation, usageNote, and usageNoteEn.
Keep the supplied English entry, part of speech, grammatical form, and contextual sense.
Rules:
- translation must express the entry's actual contribution in SOURCE CONTEXT, not an unrelated or overly broad dictionary gloss.
- translation is the reusable, standalone learner-dictionary gloss shown at the top of a card. For prepositions, conjunctions, and function words, NEVER store an agreement-bound fragment such as "em todas as" by itself. Use a reusable gloss such as "em toda a extensão de" when that is the contextual sense.
- exampleTranslation must use the natural inflected realization required by its sentence. It may differ morphologically from the reusable gloss while preserving exactly the same sense.
- Add a second equivalent with " / " only if it is genuinely interchangeable in the same context. Otherwise keep one.
- example must be a new, self-contained sentence of 6 to 12 words and contain the exact English entry.
- exampleTranslation must faithfully translate that short example.
- usageNote must be one short pt-BR teaching sentence (max 150 characters). For a function word, explicitly show its realization in the example.
- usageNoteEn must be the concise English definition of the same contextual sense.
Required distinction: for "across all operations", translation can be "em toda a extensão de", while exampleTranslation naturally uses "em todas as operações"; usageNote explains that correspondence. Never use the vague isolated gloss "por".`,
          },
          {
            role: "user",
            content: JSON.stringify({
              entry: normalized.normalizedWord,
              partOfSpeech: normalized.partOfSpeech,
              grammaticalForm: normalized.grammaticalForm,
              sourceContext,
              proposedTranslation: normalized.translation,
              proposedExample: normalized.example,
              proposedExampleTranslation: normalized.exampleTranslation,
              proposedUsageNote: normalized.usageNote,
              proposedUsageNoteEn: normalized.usageNoteEn,
            }),
          },
        ],
        model,
        { type: "json_object" },
        { temperature: 0.1, maxTokens: 180, timeoutMs: 12_000 }
      )
      const revisedTranslation = filterTranslationChunks(
        contextualRevision?.translation,
        true,
        normalized.partOfSpeech,
        preferContextualAlternativeTranslation
      )
      const revisedExample = normalizeInlineWhitespace(contextualRevision?.example)
      const revisedExampleTranslation = normalizePtBrOrthography(contextualRevision?.exampleTranslation)
      const revisedUsageNote = normalizePtBrOrthography(contextualRevision?.usageNote).slice(0, 150)
      const revisedUsageNoteEn = normalizeInlineWhitespace(contextualRevision?.usageNoteEn).slice(0, 150)
      const revisedWordCount = revisedExample.split(/\s+/).filter(Boolean).length
      const preservesEntry = revisedExample
        .toLocaleLowerCase("en-US")
        .includes(normalized.normalizedWord.toLocaleLowerCase("en-US"))
      if (
        revisedTranslation &&
        revisedExampleTranslation &&
        preservesEntry &&
        revisedWordCount >= 6 &&
        revisedWordCount <= 12
      ) {
        normalized = {
          ...normalized,
          translation: normalizePtBrOrthography(revisedTranslation),
          example: revisedExample,
          exampleTranslation: revisedExampleTranslation,
          usageNote: revisedUsageNote || normalized.usageNote,
          usageNoteEn: revisedUsageNoteEn || normalized.usageNoteEn,
        }
      }
    } catch (err) {
      console.warn("[readlab-coherence] contextual review unavailable:", err instanceof Error ? err.message : err)
    }
  }
  if (
    targetPartOfSpeech &&
    !isCompoundOrAcronym &&
    normalized.partOfSpeech !== normalizePartOfSpeech(targetPartOfSpeech)
  ) {
    try {
      const requestedSense = await resolveRequestedPartOfSpeech(
        normalized.normalizedWord,
        normalizePartOfSpeech(targetPartOfSpeech),
        DERIVATION_AI_MODEL
      )
      if (requestedSense?.partOfSpeech === normalizePartOfSpeech(targetPartOfSpeech)) {
        normalized = {
          ...normalized,
          translation: requestedSense.translation,
          usageNote: requestedSense.usageNote,
          usageNoteEn: requestedSense.usageNoteEn,
          example: requestedSense.example,
          exampleTranslation: requestedSense.exampleTranslation,
          usageStatus: requestedSense.usageStatus,
        }
      }
    } catch (err) {
      console.error("[requested-sense] unavailable:", err instanceof Error ? err.message : err)
    }
  }

  // "Outras formas" is the one generation-affecting display preference.
  // When disabled, return after the central model: do not call the family
  // generator, same-spelling validator, reviewer, or external validators.
  if (!includeAlternativeForms) {
    const withoutAlternativeForms = {
      ...normalized,
      alternativeForms: [],
      derivationsValidated: true,
    }
    logRevisionAudit("generate", {
      word,
      partOfSpeech: withoutAlternativeForms.partOfSpeech,
      translation: withoutAlternativeForms.translation,
      usageNote: withoutAlternativeForms.usageNote ?? "",
      example: withoutAlternativeForms.example,
      exampleTranslation: withoutAlternativeForms.exampleTranslation,
    })
    return withoutAlternativeForms
  }

  // Family enrichment and lexicographer review are independent audits of the
  // primary entry. Start the slower family request now, then run the review
  // below instead of making the two model calls wait for one another.
  const familyFormsPromise: Promise<FlashcardAIResponse["alternativeForms"]> =
    includeAlternativeForms && !isCompoundOrAcronym
      ? generateCompleteDerivations(
          normalized.normalizedWord,
          normalized.partOfSpeech,
          DERIVATION_AI_MODEL
        ).catch((err) => {
          console.error("[derivation-pass] unavailable:", err instanceof Error ? err.message : err)
          return []
        })
      : Promise.resolve([])
  const sameSpellingAlternativesPromise = validateSameSpellingAlternativeForms(
    normalized.normalizedWord,
    normalized.partOfSpeech,
    normalized.alternativeForms
  )

  // Lexicographer review pass: ask the mini model to fact-check the primary
  // model's output.
  //
  // SELECTIVE CORRECTION POLICY:
  // - We NEVER override partOfSpeech, translation, normalizedWord, usageNote,
  //   example, synonyms, or antonyms with the reviewer's version. The mini
  //   model is less capable than the primary and was corrupting those fields
  //   (e.g. stripping accents from "rápido" → "rapido", or changing a correct
  //   adjective to noun).
  // - We DO apply the reviewer's corrected "alternativeForms" when:
  //     (a) the reviewer flagged the card (approved=false), AND
  //     (b) the reviewer produced a corrected alternativeForms array, AND
  //     (c) the corrected array is strictly shorter than the original (meaning
  //         the reviewer removed entries, not added new ones — a much safer
  //         operation that doesn't require creativity from the mini model).
  //   This handles the specific case where the primary model lists archaic
  //   derivations (e.g. "quick" as noun) that slipped through the prompt and
  //   the deterministic blocklist.
  let finalNormalized = normalized
  try {
    const reviewRes = await fetch(
      `${getBaseUrl()}/api/ai/lexicographer-review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({ word, card: normalized, targetPartOfSpeech }),
      }
    )
    if (reviewRes.ok) {
      const review = (await reviewRes.json()) as {
        approved: boolean
        reason: string
        issues: { field: string; problem: string }[]
        corrected: Partial<FlashcardAIResponse> | null
        reviewerError?: string
      }
      if (!review.reviewerError && !review.approved) {
        if (review.issues.length > 0) {
          console.log(
            `[lexicographer-review] "${word}" flagged: ${review.issues
              .map((i) => `${i.field}=${i.problem}`)
              .join("; ")}`
          )
        } else if (review.reason) {
          console.log(`[lexicographer-review] "${word}" flagged: ${review.reason}`)
        }
        // Selective correction: apply the reviewer's alternativeForms ONLY
        // when it is strictly a subset of what the primary model produced
        // (i.e. the reviewer removed entries). This is safe because:
        // - Removal doesn't require lexicographic creativity from the mini model.
        // - We never add new derivations the primary model didn't already generate.
        let corrected = review.corrected
        if (corrected?.grammaticalForm) {
          finalNormalized = {
            ...finalNormalized,
            grammaticalForm: normalizeGrammaticalForm(corrected.grammaticalForm),
          }
        }
        let hydratedReviewerForms: FlashcardAIResponse["alternativeForms"] = []
        const reviewerForms = corrected?.alternativeForms as unknown[] | undefined
        if (corrected && Array.isArray(reviewerForms) && reviewerForms.some((form) => typeof form === "string")) {
          const lemmas = reviewerForms.filter((form): form is string => typeof form === "string")
          const hydrated = await hydrateDerivationEntries(
            normalized.normalizedWord,
            normalized.partOfSpeech,
            lemmas,
            DERIVATION_AI_MODEL
          )
          if (hydrated.length > 0) {
            hydratedReviewerForms = hydrated
            corrected = { ...corrected, alternativeForms: hydrated }
          }
        }
        let appliedFullReviewerCorrection = false
        // A small reviewer is a verifier, not an authority for the main entry.
        // It may only remove already-proposed family members below.
        const canReplacePrimaryEntry = false
        const correctedWord = normalizeInlineWhitespace(corrected?.normalizedWord || normalized.normalizedWord)
        const hasCompleteCorrection = Boolean(
          corrected?.partOfSpeech && corrected?.translation && corrected?.example
        )
        if (
          canReplacePrimaryEntry &&
          corrected &&
          hasCompleteCorrection &&
          correctedWord.toLowerCase() === normalized.normalizedWord.toLowerCase() &&
          (!targetPartOfSpeech || corrected.partOfSpeech === normalizePartOfSpeech(targetPartOfSpeech))
        ) {
          finalNormalized = normalizeFlashcardResponse(
            {
              ...normalized,
              ...corrected,
              // A reviewer correction may be complete for the main entry yet
              // omit the family array. Never turn a populated, independently
              // generated family into [] merely because of that omission.
              alternativeForms:
                Array.isArray(corrected.alternativeForms) && corrected.alternativeForms.length > 0
                  ? corrected.alternativeForms
                  : normalized.alternativeForms,
              normalizedWord: normalized.normalizedWord,
            },
            word,
            {
              includeConjugations,
              includeAlternativeForms,
              includeMultipleTranslations,
              preferContextualAlternativeTranslation,
              synonymsLevel,
              isCompoundOrAcronym,
              efommMode,
              targetPartOfSpeech,
            }
          )
          if (hydratedReviewerForms.length > 0) {
            finalNormalized = {
              ...finalNormalized,
              alternativeForms: mergeDerivationForms(normalized.alternativeForms, hydratedReviewerForms),
            }
          }
          appliedFullReviewerCorrection = true
        }
        const originalAlts = normalized.alternativeForms ?? []
        const reviewerKeys = new Set(
          (review.corrected?.alternativeForms ?? []).map((form) =>
            `${normalizeInlineWhitespace((form as { word?: unknown })?.word).toLowerCase()}::${normalizePartOfSpeech((form as { partOfSpeech?: unknown })?.partOfSpeech)}`
          )
        )
        const originalKeys = new Set(
          originalAlts.map((form) => `${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`)
        )
        const reviewerAddedUnknownForm = [...reviewerKeys].some((key) => !originalKeys.has(key))
        const correctedAlts = reviewerAddedUnknownForm
          ? originalAlts
          : originalAlts.filter((form) => reviewerKeys.has(`${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`))
        if (
          Array.isArray(correctedAlts) &&
          !appliedFullReviewerCorrection &&
          correctedAlts.length > 0 &&
          correctedAlts.length < originalAlts.length
        ) {
          // Re-run the same normalization pipeline on the reviewer's alts so
          // the blocklist and dedup logic are always applied.
          const reNormalized = normalizeAlternativeForms(
            correctedAlts,
            normalized.normalizedWord,
            normalized.partOfSpeech,
            true,
            false
          )
          console.log(
            `[lexicographer-review] "${word}" alternativeForms: ${originalAlts.length} → ${reNormalized.length} (reviewer pruned)`
          )
          finalNormalized = { ...normalized, alternativeForms: reNormalized }
        }
      }
    }
  } catch (err) {
    console.error("[lexicographer-review] unreachable:", err instanceof Error ? err.message : err)
  }

  const familyForms = await familyFormsPromise
  if (familyForms.length > 0) {
    finalNormalized = {
      ...finalNormalized,
      alternativeForms: normalizeAlternativeForms(
        [...finalNormalized.alternativeForms, ...familyForms],
        finalNormalized.normalizedWord,
        finalNormalized.partOfSpeech,
        includeAlternativeForms,
        isCompoundOrAcronym
      ),
    }
  }

  const validatedSameSpellingKeys = await sameSpellingAlternativesPromise
  finalNormalized = {
    ...finalNormalized,
    alternativeForms: finalNormalized.alternativeForms.filter((form) => {
      const isSameSpellingShift =
        normalizeInlineWhitespace(form.word).toLowerCase() === finalNormalized.normalizedWord.toLowerCase() &&
        normalizePartOfSpeech(form.partOfSpeech) !== finalNormalized.partOfSpeech
      return !isSameSpellingShift || validatedSameSpellingKeys.has(alternativeKey(form))
    }),
  }

  // One final independent pass protects the persisted family from an
  // over-eager generator or reviewer. The validator only removes entries; if
  // it is unavailable, the reviewed family is preserved unchanged.
  if (includeAlternativeForms && finalNormalized.alternativeForms.length > 0) {
    finalNormalized = {
      ...finalNormalized,
      alternativeForms: await validateAlternativeFormsForLearners(
        finalNormalized.normalizedWord,
        finalNormalized.partOfSpeech,
        finalNormalized.alternativeForms
      ),
    }
    finalNormalized = {
      ...finalNormalized,
      alternativeForms: await applyExternalDerivationChecks(finalNormalized.alternativeForms),
    }
  }

  // This response crosses the API boundary to the browser. It prevents the
  // client creation flow from sending the exact same alternatives to GLM again.
  finalNormalized = {
    ...finalNormalized,
    derivationsValidated: true,
  }

  logRevisionAudit("generate", {
    word,
    partOfSpeech: finalNormalized.partOfSpeech,
    translation: finalNormalized.translation,
    usageNote: finalNormalized.usageNote ?? "",
    example: finalNormalized.example,
    exampleTranslation: finalNormalized.exampleTranslation,
  })
  return finalNormalized
}
interface GrammarQuestionResponse {
  questionText: string
  contextPassage?: string | null
  options: GrammarQuestionOption[]
}

export async function findAlternativePos(
  word: string,
  currentPos: string,
  model: string = DEFAULT_AI_MODEL
): Promise<AlternativeForm[]> {
  const POS_LIST = ["verb", "noun", "adjective", "adverb", "preposition", "conjunction", "interjection"]
  const validAlternatives = POS_LIST.filter((p) => p !== currentPos)

  try {
    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: `You are a lexicographer. Given an English word and its current part of speech, find ALL other parts of speech that this word can function as in modern American English. For each valid alternative POS, provide:
- "word": the actual English word in that alternative POS (which may differ from the input word for derivational forms, e.g., "beautiful" for "beauty", or "beautifully" for "beauty")
- "partOfSpeech": the alternative POS
- "translation": up to 2 natural Brazilian Portuguese equivalents separated by " / " (e.g., "custódia / guarda")
- "example": one example sentence in English
- "usageNote": a brief usage note in Brazilian Portuguese (max 100 chars)
- "usageNoteEn": a brief usage note in English (max 100 chars)
- "ipa": the IPA transcription of the alternative word

DERIVATION RULES (follow strictly):
1. The alternative word MUST be a real, commonly used English word. Never invent forms.
2. Only return POS that the word genuinely functions as in everyday modern English. For example:
   - "rainforest" is ONLY a noun — it cannot be an adjective, verb, or adverb. Return [].
   - "beauty" (noun) -> "beautiful" (adjective), "beautify" (verb), "beautifully" (adverb) — these are valid.
   - "keep" (verb) -> "keep" (noun, meaning "custody") — valid polysemy.
   - "fast" (adjective) -> "fast" (adverb, meaning "quickly") — valid polysemy.
3. Do NOT return the same word with the same POS. Only return genuinely different POS.
4. For compound nouns (e.g., "rainforest", "sunflower", "birthday"), they typically have NO alternative POS. Return [].
5. For words that exist in only one POS (e.g., "the" is only an article/determiner), return [].
6. Before returning each alternative, verify internally: "Can this word actually function as {POS} in a real English sentence?" If unsure, do not include it.

IMPORTANT: If the word has a derivational form in the alternative POS with a different spelling, use that different spelling as the "word". For example, for "beauty" (noun), the adjective form word is "beautiful" (not "beauty"). For "keep" (verb), the noun form word is "keep" (same spelling).

Return ONLY a JSON object with key "alternatives" containing an array of objects with keys: word, partOfSpeech, translation, example, usageNote, usageNoteEn, ipa. If no valid alternatives exist, return {"alternatives": []}.`,
      },
      {
        role: "user",
        content: JSON.stringify({ word, currentPartOfSpeech: currentPos }),
      },
    ]

    const raw = await callOpenRouter<{ alternatives: AlternativeForm[] }>(
      messages,
      model,
      { type: "json_object" },
      { temperature: 0.2 }
    )

    const alts = raw?.alternatives ?? []
    const seen = new Set<string>()
    return alts.filter((a) => {
      if (!a.partOfSpeech || !validAlternatives.includes(a.partOfSpeech)) return false
      if (!a.word) return false
      if (seen.has(a.partOfSpeech)) return false
      seen.add(a.partOfSpeech)
      return true
    })
  } catch {
    return []
  }
}

/** A dedicated, atomic word-family pass used by flashcard generation. */
async function generateCompleteDerivations(
  word: string,
  partOfSpeech: string,
  model: string
): Promise<FlashcardAIResponse["alternativeForms"]> {
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a senior English lexicographer completing a learner's dictionary word family for Brazilian students. Return ONLY JSON: {"alternativeForms":[{"word":"...","partOfSpeech":"...","translation":"...","example":"..."}]}.

Given one dictionary entry, list up to 4 common modern morphological relatives, prioritizing the most useful learner forms. This is not a synonym task and not merely a spelling task.

Rules:
- Include only real, current, learner-useful derivations or common same-spelling POS senses from the same lexeme.
- Exclude archaic, historical, highly specialized, poetic, and set-phrase-only senses.
- Do not include the base entry with the same part of speech.
- Every entry needs its own correct POS, Brazilian Portuguese translation for THAT POS, and a natural example using that POS.
- A noun must have a noun translation; a verb must have an infinitive translation; an adverb must have an adverbial translation.
- Return [] only if there are genuinely no common family forms.
- Example of complete modern family: quick (adjective) -> quickly (adverb), quickness (noun), quicken (verb). Do not include quick as a modern adverb or as its archaic noun sense.
- Example of an unrelated spelling coincidence: almost is never part of the family of alive.`,
    },
    {
      role: "user",
      content: JSON.stringify({ word, partOfSpeech }),
    },
  ]
  const raw = await callOpenRouter<{ alternativeForms?: unknown[] }>(
    messages,
    model,
    { type: "json_object" },
    { temperature: 0.1, maxTokens: 300, timeoutMs: 6_000 }
  )
  const forms = Array.isArray(raw?.alternativeForms) ? raw.alternativeForms : []
  const structured = forms.filter(isCompleteDerivation) as FlashcardAIResponse["alternativeForms"]
  if (structured.length > 0) return structured

  // This stage has a strict structured schema. Retrying with a second model
  // call when it returns bare lemmas caused unpredictable extra latency; the
  // primary card's already-structured alternatives remain available instead.
  return []
}

async function validateAlternativeFormsForLearners(
  baseWord: string,
  basePartOfSpeech: string,
  forms: FlashcardAIResponse["alternativeForms"]
): Promise<FlashcardAIResponse["alternativeForms"]> {
  const { trusted, candidates } = partitionDerivationsForValidation(baseWord, forms)
  // Clear surface-level families (quick → quickly/quicken/quickness) were
  // already screened by the deterministic register/POS filters. Reserve the
  // slower GLM gate for root-changing or same-spelling POS cases only.
  if (candidates.length === 0) return trusted

  try {
    const response = await fetch(`${getBaseUrl()}/api/ai/validate-derivations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        baseWord,
        basePartOfSpeech,
        derivations: candidates.map(({ word, partOfSpeech }) => ({
          word,
          partOfSpeech,
        })),
      }),
    })
    // An ambiguous form without a completed independent validation is omitted.
    // The card itself stays usable and a later enrichment can propose it again.
    if (!response.ok) return trusted
    const result = (await response.json()) as {
      valid?: Array<{ word?: unknown; partOfSpeech?: unknown }>
      validatorError?: string
    }
    if (result.validatorError || !Array.isArray(result.valid)) return trusted
    const validKeys = new Set(
      result.valid.map((form) =>
        `${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`
      )
    )
    return [...trusted, ...candidates.filter((form) =>
      validKeys.has(`${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`)
    )]
  } catch (err) {
    console.error("[derivation-validator] unavailable:", err instanceof Error ? err.message : err)
    return trusted
  }
}

async function applyExternalDerivationChecks(
  forms: FlashcardAIResponse["alternativeForms"]
): Promise<FlashcardAIResponse["alternativeForms"]> {
  // Frequency and dictionary attestation are independent network checks.
  // Running them together removes one full network round-trip from the card's
  // critical path.
  const [frequent, attested] = await Promise.all([
    filterRareDerivations(forms),
    filterUnattestedDerivations(forms),
  ])
  const frequentKeys = new Set(
    frequent.map((form) => `${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`)
  )
  const attestedKeys = new Set(
    attested.map((form) => `${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`)
  )
  return forms.filter((form) => {
    const key = `${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizePartOfSpeech(form.partOfSpeech)}`
    return frequentKeys.has(key) && attestedKeys.has(key)
  })
}

/**
 * A dictionary tells us that a form exists; frequency helps distinguish a
 * learner-family headword from a merely possible formation. The public corpus
 * is advisory: an outage never removes an otherwise validated derivation.
 */
async function filterRareDerivations(
  forms: FlashcardAIResponse["alternativeForms"]
): Promise<FlashcardAIResponse["alternativeForms"]> {
  const frequencies = await Promise.all(forms.map((form) => lookupLexicalFrequency(form.word)))
  return forms.filter((_, index) => {
    const frequency = frequencies[index]
    return frequency === undefined || frequency >= MIN_LEXICAL_FREQUENCY
  })
}

async function filterUnattestedDerivations(
  forms: FlashcardAIResponse["alternativeForms"]
): Promise<FlashcardAIResponse["alternativeForms"]> {
  const attestations = await Promise.all(
    forms.map((form) => hasDictionaryHeadwordForPos(form.word, form.partOfSpeech))
  )
  return forms.filter((_, index) => attestations[index] !== false)
}

/**
 * `false` means the dictionary explicitly rejected the candidate. `undefined`
 * means the lookup was unavailable, in which case we fail open and retain the
 * independently reviewed entry.
 */
async function hasDictionaryHeadwordForPos(word: string, partOfSpeech: string): Promise<boolean | undefined> {
  const normalizedWord = normalizeInlineWhitespace(word).toLowerCase()
  const normalizedPos = normalizePartOfSpeech(partOfSpeech)
  if (!normalizedWord || !normalizedPos) return undefined
  const key = `${normalizedWord}::${normalizedPos}`
  const cached = derivationDictionaryCache.get(key)
  if (cached) return cached
  const request = (async () => {
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`,
        // Advisory check: fail open quickly rather than extending card creation
        // behind an unreliable public dictionary response.
        { signal: AbortSignal.timeout(1_200) }
      )
      if (response.status === 404) return false
      if (!response.ok) return undefined
      const entries = await response.json() as Array<{ meanings?: Array<{ partOfSpeech?: unknown }> }>
      return entries.some((entry) =>
        (entry.meanings ?? []).some(
          (meaning) => normalizePartOfSpeech(meaning.partOfSpeech, "") === normalizedPos
        )
      )
    } catch {
      return undefined
    }
  })()
  derivationDictionaryCache.set(key, request)
  return request
}

async function lookupLexicalFrequency(word: string): Promise<number | undefined> {
  const normalized = normalizeInlineWhitespace(word).toLowerCase()
  if (!normalized) return undefined
  const cached = derivationFrequencyCache.get(normalized)
  if (cached) return cached
  const request = (async () => {
    try {
      const response = await fetch(
        `https://api.datamuse.com/words?sp=${encodeURIComponent(normalized)}&md=f&max=1`,
        { signal: AbortSignal.timeout(900) }
      )
      if (!response.ok) return undefined
      const results = await response.json() as Array<{ word?: unknown; tags?: unknown }>
      const match = results.find((item) => normalizeInlineWhitespace(item.word).toLowerCase() === normalized)
      const tag = Array.isArray(match?.tags)
        ? match.tags.find((value): value is string => typeof value === "string" && value.startsWith("f:"))
        : undefined
      const frequency = Number.parseFloat(tag?.slice(2) ?? "")
      return Number.isFinite(frequency) ? frequency : undefined
    } catch {
      return undefined
    }
  })()
  derivationFrequencyCache.set(normalized, request)
  return request
}

async function resolveRequestedPartOfSpeech(
  word: string,
  partOfSpeech: string,
  model: string
): Promise<{
  partOfSpeech: string
  translation: string
  usageNote: string
  usageNoteEn: string
  example: string
  exampleTranslation: string
  usageStatus: "current" | "rare" | "archaic"
} | null> {
  // High-confidence dictionary correction retained as lexical data, not as a
  // morphology rule: this sense is routinely confused with the adjective by
  // compact models, yet is a valid archaic noun entry worth cataloguing.
  if (word.toLowerCase() === "quick" && partOfSpeech === "noun") {
    return {
      partOfSpeech: "noun",
      translation: "carne viva e sensível sob a unha; sabugo",
      usageNote: "Uso arcaico: refere-se à parte viva e muito sensível da carne sob a unha da mão ou do pé.",
      usageNoteEn: "Archaic: the living, sensitive flesh beneath a fingernail or toenail.",
      example: "The thorn went into the quick beneath her fingernail.",
      exampleTranslation: "O espinho atingiu a carne viva sob a unha dela.",
      usageStatus: "archaic",
    }
  }
  const dictionaryDefinitions = await lookupDictionaryDefinitions(word, partOfSpeech)
  const raw = await callOpenRouter<{
    partOfSpeech?: unknown
    translation?: unknown
    usageNote?: unknown
    usageNoteEn?: unknown
    example?: unknown
    exampleTranslation?: unknown
    usageStatus?: unknown
  }>(
    [
      {
        role: "system",
        content: `You are a historical and contemporary English dictionary editor. Return ONLY JSON with partOfSpeech, translation, usageNote, usageNoteEn, example, exampleTranslation, usageStatus.
The requested word+POS must be handled as an exact dictionary sense. If it is current, use usageStatus="current"; if it survives only as archaic, historical, poetic, or set-phrase usage, use usageStatus="archaic" and define THAT sense accurately. Do not substitute a more common POS.
Translations are Brazilian Portuguese. The example and both notes must use the requested POS and exact sense.
Important lexical standard: quick as a noun is archaic and means the living, highly sensitive flesh beneath a fingernail or toenail; it is not "rápido".`,
      },
      { role: "user", content: JSON.stringify({ word, partOfSpeech, dictionaryDefinitions }) },
    ],
    model,
    { type: "json_object" },
    { temperature: 0.1 }
  )
  const resolvedPos = normalizePartOfSpeech(raw?.partOfSpeech, "")
  const translation = normalizePtBrOrthography(raw?.translation)
  const usageNote = normalizeInlineWhitespace(raw?.usageNote)
  const usageNoteEn = normalizeInlineWhitespace(raw?.usageNoteEn)
  const example = normalizeInlineWhitespace(raw?.example)
  const exampleTranslation = normalizePtBrOrthography(raw?.exampleTranslation)
  if (!resolvedPos || !translation || !example) return null
  return {
    partOfSpeech: resolvedPos,
    translation,
    usageNote,
    usageNoteEn,
    example,
    exampleTranslation,
    usageStatus: raw?.usageStatus === "archaic" || raw?.usageStatus === "rare" ? raw.usageStatus : "current",
  }
}

async function lookupDictionaryDefinitions(word: string, partOfSpeech: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(4_000) }
    )
    if (!response.ok) return []
    const entries = await response.json() as Array<{
      meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }>
    }>
    return entries
      .flatMap((entry) => entry.meanings ?? [])
      .filter((meaning) => normalizePartOfSpeech(meaning.partOfSpeech, "") === partOfSpeech)
      .flatMap((meaning) => meaning.definitions ?? [])
      .map((definition) => normalizeInlineWhitespace(definition.definition))
      .filter(Boolean)
      .slice(0, 4)
  } catch {
    return []
  }
}

function isCompleteDerivation(value: unknown): value is FlashcardAIResponse["alternativeForms"][number] {
  if (!value || typeof value !== "object") return false
  const form = value as Record<string, unknown>
  return Boolean(
    normalizeInlineWhitespace(form.word) &&
    normalizeInlineWhitespace(form.partOfSpeech) &&
    normalizeInlineWhitespace(form.translation) &&
    normalizeInlineWhitespace(form.example)
  )
}

function mergeDerivationForms(
  ...groups: FlashcardAIResponse["alternativeForms"][]
): FlashcardAIResponse["alternativeForms"] {
  const seen = new Set<string>()
  return groups.flat().filter((form) => {
    const key = `${normalizeInlineWhitespace(form.word).toLowerCase()}::${normalizeInlineWhitespace(form.partOfSpeech).toLowerCase()}`
    if (!form.word || !form.partOfSpeech || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function hydrateDerivationEntries(
  baseWord: string,
  basePartOfSpeech: string,
  lemmas: string[],
  model: string
): Promise<FlashcardAIResponse["alternativeForms"]> {
  const uniqueLemmas = [...new Set(lemmas.map(normalizeInlineWhitespace).filter(Boolean))].slice(0, 8)
  if (uniqueLemmas.length === 0) return []
  const raw = await callOpenRouter<{ alternativeForms?: unknown[] }>(
    [
      {
        role: "system",
        content: `Return ONLY JSON. Convert the supplied English derivation candidates into complete learner-dictionary objects.
Schema: {"alternativeForms":[{"word":"...","partOfSpeech":"verb|noun|adjective|adverb","translation":"pt-BR translation for that exact POS","example":"natural English sentence"}]}.
Discard a candidate if it is not a real, current derivation. Never return a string in alternativeForms; every kept entry must be a complete object with all four fields.`,
      },
      {
        role: "user",
        content: JSON.stringify({ baseWord, basePartOfSpeech, candidates: uniqueLemmas }),
      },
    ],
    model,
    { type: "json_object" },
    { temperature: 0.1, maxTokens: 700, timeoutMs: 16_000 }
  )
  return (Array.isArray(raw?.alternativeForms) ? raw.alternativeForms : []).filter(
    isCompleteDerivation
  ) as FlashcardAIResponse["alternativeForms"]
}

function normalizeGrammarQuestionText(value: unknown): string {
  const text = normalizeInlineWhitespace(value)
  if (!text) return "Choose the best option."
  return text
    .replace(/\([^)]*(opinion\s*>\s*size|size\s*>\s*age|ordem\s+dos\s+adjetivos|sequ[e�]ncia\s+padr[a�]o)[^)]*\)/gi, "")
    .replace(/^\s*contexto\s*:\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}
function isLikelyGrammarRuleDump(text: string): boolean {
  const normalized = normalizeForLooseMatch(text)
  return /(regra|sequencia padrao|sequencia|ordem dos adjetivos|adverb placement|estrutura padrao|gramatica|analise as frases|opinion\s*>\s*size|size\s*>\s*age|age\s*>\s*shape|shape\s*>\s*color|color\s*>\s*origin|origin\s*>\s*material|material\s*>\s*purpose)/i.test(
    normalized
  )
}
function normalizeGrammarContextPassage(value: unknown): string | null {
  const text = normalizeInlineWhitespace(value)
  if (!text) return null
  const cleaned = text
    .replace(/^\s*texto\s+de\s+apoio\s*:\s*/i, "")
    .replace(/^\s*contexto\s*:\s*/i, "")
    .trim()
  if (!cleaned) return null
  if (isLikelyGrammarRuleDump(cleaned)) return null
  const normalized = normalizeForLooseMatch(cleaned)
  // Drop repeated/generic story templates that add little signal to solving the question.
  const genericTemplatePatterns = [
    /imagine\s+que\s+um\s+grupo\s+de\s+amigos/, 
    /decoracao\s+de\s+um\s+novo\s+escritorio/,
    /contexto\s+geral/,
    /em\s+descricoes\s+formais\s+ou\s+casuais/,
  ]
  if (genericTemplatePatterns.some((pattern) => pattern.test(normalized))) {
    return null
  }
  const hasScenarioSignal =
    /(imagine|situa[c�][a�]o|cen[a�]rio|durante|enquanto|em uma|numa|briefing|memo|report|radio|watch|patrol|mission|drill|inspection|handover|email|mensagem|reuni[a�]o)/i.test(
      normalized
    )
  const hasConcreteAnchor =
    /(officer|crew|cadet|captain|bridge|deck|engine\s*room|vessel|cargo|harbor|port|runway|hangar|maintenance|logbook|dispatch|checkpoint|convoy|watch\s*officer|shift|report|briefing|command|training|sortie|patrol|inspection|radar|equipment|procedures?)/i.test(
      normalized
    )
  // Keep concise but meaningful operational contexts.
  if (!hasScenarioSignal && !hasConcreteAnchor && cleaned.length < 80) return null
  if (cleaned.length < 24) return null
  return cleaned
}
function normalizeOptions(raw: unknown): GrammarQuestionOption[] {
  const letters: GrammarQuestionOption["letter"][] = ["A", "B", "C", "D", "E"]
  const fallback = letters.map((letter, idx) => ({
    letter,
    text: `Option ${idx + 1}`,
    isAnswer: letter === "A",
    explanation: "",
  }))
  if (!Array.isArray(raw)) return fallback
  const mapped = raw
    .map((opt, idx) => {
      const value = opt as Partial<GrammarQuestionOption>
      const letter = letters[idx]
      return {
        letter,
        text: typeof value?.text === "string" && value.text.trim() ? value.text : `Option ${idx + 1}`,
        isAnswer: Boolean(value?.isAnswer),
        explanation: typeof value?.explanation === "string" ? value.explanation : "",
      }
    })
    .slice(0, 5)
  while (mapped.length < 5) {
    const letter = letters[mapped.length]
    mapped.push({ letter, text: `Option ${mapped.length + 1}`, isAnswer: false, explanation: "" })
  }
  if (!mapped.some((o) => o.isAnswer)) {
    mapped[0].isAnswer = true
  }
  return mapped
}
export async function generateGrammarQuestion(
  topicLabel: string,
  subtopics: string[],
  questionType: "correct" | "incorrect",
  model: string = DEFAULT_AI_MODEL,
  userWords?: string[],
  recentContexts?: string[]
): Promise<GrammarQuestionResponse> {
  const scope = [topicLabel, ...subtopics].filter(Boolean).join(" > ")
  const userWordsHint = Array.isArray(userWords) && userWords.length > 0
    ? `Learner words are optional. Use at most ONE of these words only if it fits naturally; otherwise use none: ${userWords.slice(0, 8).join(", ")}. Never force vocabulary insertion.`
    : "Do not force learner vocabulary."
  const antiRepeatHint = Array.isArray(recentContexts) && recentContexts.length > 0
    ? `Avoid repeating ideas, opening structures, or lexical patterns from recent generated items: ${recentContexts
        .slice(-4)
        .map((s) => `"${normalizeInlineWhitespace(s).slice(0, 180)}"`)
        .join(" | ")}.`
    : ""
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are an American English grammar teacher for Brazilian learners.
Create ONE multiple-choice question with 5 options (A-E).
Question mode:
- correct: exactly 1 option is grammatically correct.
- incorrect: exactly 1 option is grammatically incorrect.
Scope and difficulty:
- Main topic: ${topicLabel}
- Subtopics: ${subtopics.join(", ") || "(none)"}
- Difficulty: intermediate
- You may combine topic + subtopics in a single question when it improves realism.
- Target style: military exam preparation tone inspired by EFOMM / EN / AFA.
- Build original items only (do NOT copy or paraphrase real exam questions).
Question design (organic + exam-like):
- Randomly choose ONE archetype for each item and keep variety across calls:
  1) complete-the-excerpt (1 blank)
  2) complete-the-excerpt (2 short blanks represented in one missing segment)
  3) sentence judgment (which option is correct/incorrect)
  4) best rewrite of a formal message/report segment
  5) choose the most appropriate sentence to continue a short operational context
  6) error spotting in a realistic memo/radio-log style line
- Keep the wording similar to exam commands (for example: "Mark the correct option to complete the excerpt below.", "Which sentence is grammatically correct?", "Choose the incorrect alternative.").
- Do not mention the archetype name in the output.
Output quality rules:
- Use natural American English sentences.
- "questionText" must contain only the task instruction. Do NOT explain grammar rules.
- "contextPassage" is OPTIONAL. Default to null.
- Provide "contextPassage" only when it materially helps the learner disambiguate answer choices.
- If provided, it must be a concise, concrete mini-scenario (practical context), not a rule lecture.
- When provided, target 35-90 words in 2-4 short sentences.
- If "contextPassage" is present, every option must depend on that context (no decorative support text).
- Vary sentence openings and wording; avoid repeated templates across items.
- Avoid generic/repeated story templates.
- When present, prefer high-value contexts common in military-prep exams: maritime operations, technical routines, aviation/academy logistics, formal instructions, reports, and mission-like communication.
- NEVER include teaching-rule text such as "order of adjectives", "adverb placement", "rule", "standard sequence", "analyze the sentences", or chains like "Opinion > Size > ...".
- Avoid meta-pedagogical phrasing (e.g., "according to grammar rules", "following the standard order").
- Provide short explanations in Brazilian Portuguese for each option.
- Avoid harmful/offensive content.
${userWordsHint}
${antiRepeatHint}
Return valid JSON with exactly this shape:
{
  "questionText": "...",
  "contextPassage": "..." | null,
  "options": [
    { "letter": "A", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "B", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "C", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "D", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "E", "text": "...", "isAnswer": false, "explanation": "..." }
  ]
}
Ensure exactly one correct answer for the requested mode.`,
    },
    {
      role: "user",
      content: `Create a "${questionType}" question for this scope: ${scope || topicLabel}.`,
    },
  ]
  const generated = await callOpenRouter<GrammarQuestionResponse>(messages, model, {
    type: "json_object",
  })
  return {
    questionText: normalizeGrammarQuestionText(generated?.questionText),
    contextPassage: normalizeGrammarContextPassage(generated?.contextPassage),
    options: normalizeOptions(generated?.options),
  }
}
export async function evaluateGrammarQuestion(
  generated: GrammarQuestionResponse,
  questionType: "correct" | "incorrect",
  tagLabel: string,
  model: string = REVISOR_AI_MODEL
): Promise<GrammarQuestionResponse> {
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a quality reviewer for American English grammar questions.
Review the incoming question, keep the same mode (${questionType}), and return JSON only in the same structure.
Must guarantee:
- 5 options (A-E)
- exactly one correct answer
- short explanations in Brazilian Portuguese
- natural, unambiguous wording
- keep an original military-exam-prep tone inspired by EFOMM / EN / AFA (without copying real items)
- enforce an exam-like command style and realistic item construction (not textbook-style rule prompts)
- "questionText" contains only the task instruction (no rule explanation)
- "contextPassage" is optional and should be null unless it clearly improves disambiguation
- when present, "contextPassage" must be concrete and non-generic
- when present, "contextPassage" must be required to solve the item (not decorative)
- remove any rule-teaching text in both question and support text (e.g., standard sequences, adjective-order formulas, adverb-placement lectures, "analyze the sentences")
- keep variety of item archetypes over time (excerpt completion, sentence judgment, rewrite, continuation, memo/log error spotting)
Return only:
{
  "questionText": "...",
  "contextPassage": "..." | null,
  "options": [
    { "letter": "A", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "B", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "C", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "D", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "E", "text": "...", "isAnswer": false, "explanation": "..." }
  ]
}`,
    },
    {
      role: "user",
      content: JSON.stringify({ tagLabel, questionType, generated }),
    },
  ]
  const reviewed = await callOpenRouter<GrammarQuestionResponse>(messages, model, {
    type: "json_object",
  })
  const generatedQuestionText = normalizeGrammarQuestionText(generated.questionText)
  const generatedContextPassage = normalizeGrammarContextPassage(generated.contextPassage)
  return {
    questionText: normalizeGrammarQuestionText(reviewed?.questionText ?? generatedQuestionText),
    contextPassage: normalizeGrammarContextPassage(reviewed?.contextPassage ?? generatedContextPassage),
    options: normalizeOptions(reviewed?.options),
  }
}
import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"
