import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000"
const reportDir = resolve("qa-reports")
const reportPath = resolve(reportDir, "ai-calibration-latest.json")

const vocabularyCases = [
  { word: "pathway", pos: "noun", form: "base-form", alternatives: true },
  { word: "scrutinize", pos: "verb", form: "base-form", alternatives: true },
  { word: "wrote", pos: "verb", form: "past", preserve: true },
  { word: "written", pos: "verb", form: "past-participle", preserve: true },
  { word: "greatest", pos: "adjective", form: "superlative", preserve: true },
  { word: "better", pos: "adjective", form: "comparative", preserve: true },
  { word: "children", pos: "noun", form: "plural", preserve: true },
  { word: "increasingly", pos: "adverb", form: "base-form", alternatives: true },
  { word: "across", pos: "preposition", form: "base-form" },
  { word: "although", pos: "conjunction", form: "base-form" },
  { word: "wow", pos: "interjection", form: "base-form" },
  { word: "NASA", pos: "acronym", form: "base-form" },
  { word: "take for granted", pos: "idiom", form: "base-form" },
  { word: "run into", pos: "phrasal-verb", form: "base-form" },
  { word: "works", pos: "verb", form: "third-person-singular", preserve: true },
  { word: "working", pos: "verb", form: "present-participle", preserve: true },
  { word: "mice", pos: "noun", form: "plural", preserve: true },
  { word: "resilient", pos: "adjective", form: "base-form", alternatives: true },
  { word: "scarcely", pos: "adverb", form: "base-form" },
  { word: "threaten", pos: "verb", form: "base-form", alternatives: true },
]

const regencyTerms = [
  "struggle", "accuse", "abide", "accustomed", "complain",
  "depend", "insist", "approve", "apologize", "argue",
  "pay", "suffer", "succeed", "prevent", "remind",
  "provide", "belong", "consist", "agree", "aim",
]

const regencyCorePatterns = {
  struggle: /^(?:to|with)\b/,
  accuse: /^(?:someone|somebody)\s*\+\s*of\b/,
  abide: /^by\b/,
  accustomed: /^to\b/,
  complain: /^(?:about|of|that)\b/,
  depend: /^(?:on|upon)\b/,
  insist: /^(?:on|that)\b/,
  approve: /^(?:of|noun|—)/,
  apologize: /^(?:for|to)\b/,
  argue: /^(?:with|about|for|against|that)\b/,
  pay: /^(?:for|noun)\b/,
  suffer: /^(?:from|noun)\b/,
  succeed: /^in\b/,
  prevent: /^(?:someone|somebody|something)(?:\s*\/\s*(?:someone|somebody|something))?\s*\+\s*from\b/,
  remind: /^(?:someone|somebody)\b/,
  provide: /^(?:someone|somebody|something)\b/,
  belong: /^to\b/,
  consist: /^(?:of|in)\b/,
  agree: /^(?:with|on|about|to|that)\b/,
  aim: /^(?:to|at)\b/,
}

const readText = `After Maya set up the coastal research station, she ran into a difficult problem. The greatest challenge was not the equipment itself but whether the team could work across several remote islands. Engineers wrote detailed notes, while local guides shared practical advice. As storms intensified, supplies became scarce and the crew had to carry on. One morning, a bank of fog covered the harbor, forcing the boat to slow down. Later, Maya visited the river bank to inspect damaged sensors. Although the schedule was tight, everyone remained resilient. The project eventually worked out, and its findings shed light on how small communities adapt to rapid environmental change.`

const readCases = [
  ["set up", "After Maya set up the coastal research station."],
  ["ran into", "She ran into a difficult problem."],
  ["greatest", "The greatest challenge was not the equipment itself."],
  ["whether", "The question was whether the team could work across several remote islands."],
  ["across", "The team could work across several remote islands."],
  ["wrote", "Engineers wrote detailed notes."],
  ["practical", "Local guides shared practical advice."],
  ["intensified", "As storms intensified, supplies became scarce."],
  ["supplies", "As storms intensified, supplies became scarce."],
  ["scarce", "Supplies became scarce."],
  ["carry on", "The crew had to carry on."],
  ["bank of fog", "A bank of fog covered the harbor."],
  ["slow down", "The boat had to slow down."],
  ["bank", "Maya visited the river bank to inspect damaged sensors."],
  ["although", "Although the schedule was tight, everyone remained resilient."],
  ["tight", "Although the schedule was tight, everyone remained resilient."],
  ["resilient", "Everyone remained resilient."],
  ["worked out", "The project eventually worked out."],
  ["shed light", "Its findings shed light on how communities adapt."],
  ["adapt", "Small communities adapt to rapid environmental change."],
]

function compact(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

function containsEntry(example, entry) {
  return compact(example).toLocaleLowerCase("en-US").includes(compact(entry).toLocaleLowerCase("en-US"))
}

function looksNonEnglish(value) {
  const normalized = compact(value).toLowerCase()
  if (/[áàãâéêíóõôúüç]/i.test(normalized)) return true
  const tokens = normalized.match(/[a-z]+/g) || []
  const pt = new Set(["os", "as", "uma", "umas", "uns", "dos", "das", "em", "no", "na", "nos", "nas", "para", "por", "com", "sem", "que", "ele", "ela", "eles", "elas", "foi", "foram", "estava", "estavam"])
  const en = new Set(["the", "a", "an", "to", "of", "in", "on", "at", "for", "with", "that", "he", "she", "they", "it", "was", "were", "is", "are"])
  return tokens.filter((token) => pt.has(token)).length >= 3 && tokens.filter((token) => en.has(token)).length < 2
}

async function post(path, body, timeoutMs = 120_000) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const startedAt = Date.now()
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text.slice(0, 500) }
    }
    if (response.status !== 429 || attempt === 2) {
      return { ok: response.ok, status: response.status, latencyMs: Date.now() - startedAt, data }
    }
    const waitSeconds = Number(response.headers.get("retry-after") || 60)
    console.log(`[rate-limit] ${path}: waiting ${waitSeconds}s`)
    await new Promise((resolveWait) => setTimeout(resolveWait, waitSeconds * 1_000))
  }
  throw new Error("unreachable")
}

function validateVocabulary(test, result) {
  const card = result.data || {}
  const issues = []
  if (!result.ok) return [`HTTP ${result.status}: ${card.error || "unknown error"}`]
  if (card.partOfSpeech !== test.pos) issues.push(`POS expected ${test.pos}, got ${card.partOfSpeech}`)
  if (card.grammaticalForm !== test.form) issues.push(`form expected ${test.form}, got ${card.grammaticalForm}`)
  for (const field of ["normalizedWord", "translation", "usageNote", "usageNoteEn", "example", "exampleTranslation"]) {
    if (!compact(card[field])) issues.push(`${field} is empty`)
  }
  if (test.preserve && !containsEntry(card.example, card.normalizedWord || test.word)) issues.push("example does not contain the exact preserved form")
  if (looksNonEnglish(card.example)) issues.push("English example appears to be written in another language")
  if (compact(card.usageNote).length > 200 || compact(card.usageNoteEn).length > 200) issues.push("context exceeds the compact teaching limit")
  if (!String(card.translation).includes("/") && /,\s*/.test(String(card.translation))) issues.push("multiple translations are not slash-normalized")
  if (!compact(card.ipa)) issues.push("IPA is empty")
  if (!Array.isArray(card.synonyms)) issues.push("synonyms is not an array")
  if (!Array.isArray(card.antonyms)) issues.push("antonyms is not an array")
  if (!Array.isArray(card.alternativeForms)) issues.push("alternativeForms is not an array")
  if (test.alternatives === false && card.alternativeForms?.length) issues.push("alternativeForms generated while disabled")
  const isVerb = test.pos === "verb" || test.pos === "phrasal-verb"
  if (isVerb && (!card.verbType || !card.conjugations)) issues.push("verb metadata is incomplete")
  if (!isVerb && (card.verbType || card.conjugations)) issues.push("non-verb received verb metadata")
  if (test.pos === "phrasal-verb" && card.alternativeForms?.length) issues.push("phrasal verb received derivations")
  if (test.pos === "idiom" && String(card.translation).includes("/")) issues.push("idiom received slash-separated translations")
  for (const alternative of card.alternativeForms || []) {
    if (looksNonEnglish(alternative.example)) issues.push(`alternative ${alternative.word} has a non-English example`)
  }
  return issues
}

function validateRegency(term, result) {
  const issues = []
  if (!result.ok) return [`HTTP ${result.status}: ${result.data?.error || "unknown error"}`]
  const cards = Array.isArray(result.data?.cards) ? result.data.cards : []
  if (!cards.length) return ["no approved cards"]
  const patterns = new Set()
  for (const [index, card] of cards.entries()) {
    const prefix = `card ${index + 1}`
    for (const field of ["category", "grammaticalForm", "pattern", "example", "exampleTranslation", "meaningPt"]) {
      if (!compact(card[field])) issues.push(`${prefix}: ${field} is empty`)
    }
    if (card.grammaticalForm !== "base-form") issues.push(`${prefix}: base-form term was tagged as ${card.grammaticalForm}`)
    if (!containsEntry(card.example, term)) issues.push(`${prefix}: example does not contain exact term`)
    if (/\b(?:duke|earl|lady clara|lord ashford|carriage|aristocracy|drawing-room|regency society|estate manager)\b/i.test(card.example)) {
      issues.push(`${prefix}: example was contaminated by the historical Regency era`)
    }
    const normalizedPattern = compact(card.pattern).toLowerCase()
    if (/^(?:of|from)\s*\+\s*(?:gerund|-ing)$/.test(normalizedPattern) && /^(?:accuse|prevent)$/.test(term)) {
      issues.push(`${prefix}: required object slot is missing from pattern`)
    }
    if (term === "suffer" && /^in\b/.test(normalizedPattern)) issues.push(`${prefix}: optional adjunct presented as regency`)
    if (term === "succeed" && /^to\s*\+\s*noun\b/.test(normalizedPattern)) issues.push(`${prefix}: rare succession sense should not be included`)
    if (term === "pay" && normalizedPattern === "attention") issues.push(`${prefix}: lexical collocation presented as regency`)
    if (term === "pay" && /^to\s*\+\s*noun$/.test(normalizedPattern)) issues.push(`${prefix}: required direct object is missing before recipient`)
    if (patterns.has(normalizedPattern)) issues.push(`${prefix}: duplicate pattern`)
    patterns.add(normalizedPattern)
  }
  const corePattern = regencyCorePatterns[term]
  if (corePattern && !cards.some((card) => corePattern.test(compact(card.pattern).toLowerCase()))) {
    issues.push("most frequent core construction is missing")
  }
  if (cards.length === 1 && compact(cards[0].contrastPt)) issues.push("single-pattern family received artificial contrast")
  return issues
}

function validateLookup(query, result) {
  const issues = []
  if (!result.ok) return [`HTTP ${result.status}: ${result.data?.error || "unknown error"}`]
  if (!compact(result.data?.translation)) issues.push("translation is empty")
  const patch = result.data?.patch
  if (!patch || typeof patch !== "object") issues.push("patch is missing")
  const normalized = query.toLowerCase().trim()
  if (patch && typeof patch === "object" && !compact(patch[normalized])) issues.push("normalized query is missing from patch")
  return issues
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  vocabulary: [],
  regency: [],
  readLab: { process: null, lookups: [] },
  summary: {},
}

console.log(`\n[VocabLab] ${vocabularyCases.length} cases`)
for (const [index, test] of vocabularyCases.entries()) {
  const options = {
    includeSynonymsAntonyms: true,
    synonymsLevel: 3,
    includeConjugations: true,
    includeAlternativeForms: test.alternatives === true,
    includeUsageNote: true,
    includeIpa: true,
    includeMultipleTranslations: true,
    targetPartOfSpeech: test.pos,
    preserveSourceForm: test.preserve === true,
  }
  const result = await post("/api/ai/flashcard", { word: test.word, options })
  const issues = validateVocabulary(test, result)
  report.vocabulary.push({
    test,
    status: result.status,
    latencyMs: result.latencyMs,
    output: result.ok ? {
      word: result.data.normalizedWord,
      partOfSpeech: result.data.partOfSpeech,
      grammaticalForm: result.data.grammaticalForm,
      translation: result.data.translation,
      ipa: result.data.ipa,
      usageNote: result.data.usageNote,
      usageNoteEn: result.data.usageNoteEn,
      example: result.data.example,
      exampleTranslation: result.data.exampleTranslation,
      verbType: result.data.verbType,
      conjugations: result.data.conjugations,
      synonyms: result.data.synonyms,
      antonyms: result.data.antonyms,
      alternativeForms: result.data.alternativeForms,
    } : result.data,
    issues,
  })
  console.log(`${index + 1}/20 ${test.word}: ${result.status} ${result.latencyMs}ms ${issues.length ? `FAIL (${issues.join("; ")})` : "PASS"}`)
}

console.log(`\n[RegencyLab] ${regencyTerms.length} families`)
for (const [index, term] of regencyTerms.entries()) {
  const result = await post("/api/ai/regency-suggest", { action: "card", term }, 150_000)
  const issues = validateRegency(term, result)
  report.regency.push({
    term,
    status: result.status,
    latencyMs: result.latencyMs,
    cards: result.data?.cards || [],
    rejectedCount: result.data?.rejectedCount,
    usedFallback: result.data?.usedFallback,
    issues,
  })
  console.log(`${index + 1}/20 ${term}: ${result.status} ${result.latencyMs}ms ${issues.length ? `FAIL (${issues.join("; ")})` : `PASS (${result.data?.cards?.length || 0} cards)`}`)
}

console.log(`\n[ReadLab] processing one text + ${readCases.length} contextual lookups`)
const processResult = await post("/api/readlab/process", { content: readText })
const translationMap = processResult.data?.translationMap
const processIssues = []
if (!processResult.ok) processIssues.push(`HTTP ${processResult.status}: ${processResult.data?.error || "unknown error"}`)
if (!translationMap || typeof translationMap !== "object") processIssues.push("translationMap is missing")
const sourceContentWords = new Set((readText.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []).filter((word) => word.length > 2))
const processStopWords = new Set(["the", "and", "but", "not", "was", "were", "she", "had", "could", "its", "itself", "after", "into", "down", "out"])
const significantContentWords = new Set([...sourceContentWords].filter((word) => !processStopWords.has(word)))
const coveredWords = [...significantContentWords].filter((word) => compact(translationMap?.[word]))
const coveragePercent = significantContentWords.size ? Math.round((coveredWords.length / significantContentWords.size) * 1000) / 10 : 0
report.readLab.process = {
  status: processResult.status,
  latencyMs: processResult.latencyMs,
  text: readText,
  translationMap,
  uniqueWords: significantContentWords.size,
  coveredWords: coveredWords.length,
  coveragePercent,
  issues: processIssues,
}
console.log(`process: ${processResult.status} ${processResult.latencyMs}ms coverage=${coveragePercent}% ${processIssues.length ? "FAIL" : "PASS"}`)

for (const [index, [query, context]] of readCases.entries()) {
  const result = await post("/api/readlab/lookup", { query, context })
  const issues = validateLookup(query, result)
  report.readLab.lookups.push({ query, context, status: result.status, latencyMs: result.latencyMs, ...result.data, issues })
  console.log(`${index + 1}/20 ${query}: ${result.status} ${result.latencyMs}ms ${issues.length ? `FAIL (${issues.join("; ")})` : `PASS → ${result.data?.translation}`}`)
}

const vocabFailures = report.vocabulary.filter((entry) => entry.issues.length).length
const regencyFailures = report.regency.filter((entry) => entry.issues.length).length
const lookupFailures = report.readLab.lookups.filter((entry) => entry.issues.length).length
report.summary = {
  vocabulary: { total: report.vocabulary.length, passed: report.vocabulary.length - vocabFailures, failed: vocabFailures },
  regency: { total: report.regency.length, passed: report.regency.length - regencyFailures, failed: regencyFailures },
  readLab: {
    processPassed: processIssues.length === 0,
    lookupTotal: report.readLab.lookups.length,
    lookupPassed: report.readLab.lookups.length - lookupFailures,
    lookupFailed: lookupFailures,
    coveragePercent,
  },
}

await mkdir(reportDir, { recursive: true })
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(`\nReport: ${reportPath}`)
console.log(JSON.stringify(report.summary, null, 2))
