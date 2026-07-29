import { NextResponse } from "next/server"
import type { RegencyCard, RegencyCategory, RegencyComplement } from "@/lib/types"
import { resolveGrammaticalForm } from "@/lib/grammatical-forms"
import { recordGranitePerformance, resolveGraniteModel } from "@/lib/granite-failover"

import {
  fetchWithTimeout,
  guardApiRequest,
  readJsonWithLimit,
  safeApiError,
} from "@/lib/api-security"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const categories: RegencyCategory[] = ["verb", "adjective", "noun"]
const complements: RegencyComplement[] = ["infinitive", "gerund", "noun", "clause", "prepositional-phrase", "other"]

type RegencyPayload = Pick<RegencyCard, "category" | "grammaticalForm" | "pattern" | "complement" | "example"> & { exampleTranslation: string; meaningPt: string; contrastPt: string }

function readJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content
  return JSON.parse(fenced.trim())
}

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function connectorFromPattern(pattern: string) {
  return normalized(pattern).match(/(?:^|\+\s*)(to|for|with|on|at|about|of|from|in|into|by|against|between|over|under|after|before|as|than)\b/)?.[1] ?? ""
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** The term is already on the card front, so it must not be repeated in its pattern. */
function patternAfterTerm(pattern: string, term: string) {
  const compact = pattern.trim().replace(/\s+/g, " ")
  const prefix = new RegExp("^" + escapeRegExp(term.trim()) + "\\s*(?:\\+|:|-)?\\s*", "i")
  const withoutTerm = compact.replace(prefix, "").replace(/^\+\s*/, "").trim()
  if (/^(?:transitive|direct object|object)$/i.test(withoutTerm)) return "noun"
  if (/^(?:zero|intransitive|no complement)$/i.test(withoutTerm)) return "— (no complement)"
  return withoutTerm
}

function inferredComplement(pattern: string): RegencyComplement {
  const value = normalized(pattern)
  if (/\bto\s*\+\s*infinitive\b/.test(value)) return "infinitive"
  if (/\bgerund\b/.test(value)) return "gerund"
  if (/\b(?:that|wh-)\s*\+\s*clause\b|\bclause\b/.test(value)) return "clause"
  if (/\b(?:noun|object)\b/.test(value)) return "noun"
  if (/^(?:to|for|with|on|at|about|of|from|in|into|by|against|between|over|under|after|before|as|than)\b/.test(value)) return "prepositional-phrase"
  return "other"
}

function isCompatible(term: string, pattern: string, example: string) {
  const word = normalized(term)
  const sentence = normalized(example)
  const connector = connectorFromPattern(pattern)
  return sentence.includes(word) && (!connector || new RegExp(`\\b${connector}\\b`, "i").test(sentence))
}

function hasIncompleteRequiredObjectPattern(term: string, pattern: string) {
  const value = normalized(pattern)
  const word = normalized(term)
  if (/^(?:prevent|stop|keep|prohibit|discourage|deter)$/.test(word)) {
    return /^from\s*\+\s*(?:gerund|-ing)$/i.test(value)
  }
  if (/^(?:accuse|suspect|convict|rob|deprive|inform|remind|warn)$/.test(word)) {
    return /^of\s*\+\s*(?:noun|gerund|-ing)$/i.test(value)
  }
  if (word === "pay") {
    return /^to\s*\+\s*noun$/i.test(value)
  }
  return false
}

function startsWithSpuriousSubjectPlaceholder(term: string, pattern: string) {
  if (!/^(?:someone|somebody|something)(?:\s*\/\s*(?:someone|somebody|something))?\s*\+/i.test(pattern)) return false
  // These common families genuinely take an object immediately after the term.
  return !/^(?:accuse|suspect|convict|rob|deprive|inform|remind|warn|prevent|stop|keep|prohibit|discourage|deter|provide|supply|equip|present|pay)$/i.test(term.trim())
}

function omitsRequiredLeadingObject(term: string, pattern: string) {
  if (!/^(?:accuse|remind|provide)$/i.test(term.trim())) return false
  return !/^(?:(?:someone|somebody|something)(?:\s*\/\s*(?:someone|somebody|something))?|noun|object)\b/i.test(pattern)
}

function isKnownNonTargetConstruction(term: string, pattern: string) {
  const word = normalized(term)
  const value = normalized(pattern)
  if (word === "succeed" && /^to\s*\+\s*noun\b/.test(value)) return true
  // A bare lexical collocation such as "pay attention" belongs in VocabLab,
  // not in a grammatical-complement pattern family.
  if (!value.includes("+") && !/^(?:noun|object|—|that-clause|zero-complement)/.test(value)) return true
  return false
}

function sanitizePayload(value: unknown, term: string): RegencyPayload | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const category = typeof record.category === "string" && categories.includes(record.category as RegencyCategory)
    ? record.category as RegencyCategory
    : null
  const grammaticalForm = resolveGrammaticalForm(record.grammaticalForm, term, category ?? "")
  const pattern = typeof record.pattern === "string" ? patternAfterTerm(record.pattern, term) : ""
  const example = typeof record.example === "string" ? record.example.trim() : ""
  const exampleTranslation = typeof record.exampleTranslation === "string" ? record.exampleTranslation.trim() : ""
  const meaningPt = typeof record.meaningPt === "string" ? record.meaningPt.trim() : ""
  const contrastPt = typeof record.contrastPt === "string" ? record.contrastPt.trim() : ""
  const suppliedComplement = typeof record.complement === "string" && complements.includes(record.complement as RegencyComplement)
    ? record.complement as RegencyComplement
    : "other"
  const complement = suppliedComplement === "other" ? inferredComplement(pattern) : suppliedComplement
  if (/^(?:a|an|the|no|any|some|possessive)\s*\+\s*noun$/i.test(pattern)) return null
  if (hasIncompleteRequiredObjectPattern(term, pattern)) return null
  if (startsWithSpuriousSubjectPlaceholder(term, pattern)) return null
  if (omitsRequiredLeadingObject(term, pattern)) return null
  if (isKnownNonTargetConstruction(term, pattern)) return null
  if (/\b(?:liter[aá]ri|formal|arcaic|arcaico|raro|obsoleto|hist[oó]ric)/i.test(`${meaningPt} ${contrastPt}`)) return null
  if (!category || !pattern || !example || !exampleTranslation || !meaningPt || !isCompatible(term, pattern, example)) return null
  return { category, grammaticalForm, pattern, complement, example, exampleTranslation, meaningPt, contrastPt }
}

async function callModel(apiKey: string, model: string, system: string, user: string, maxTokens: number, maxAttempts = 3) {
  const requestedModel = model
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const activeModel = resolveGraniteModel(requestedModel)
    const startedAt = Date.now()
    const response = await fetchWithTimeout(OPENROUTER_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: activeModel,
        temperature: 0.1,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    }, 30_000)
    if (response.ok) {
      const payload = await response.json()
      recordGranitePerformance(requestedModel, Date.now() - startedAt, payload)
      const content = payload?.choices?.[0]?.message?.content
      try {
        if (typeof content !== "string") throw new Error("AI returned no content")
        return readJson(content)
      } catch (error) {
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
          continue
        }
        throw error
      }
    }
    if (response.status === 429 && attempt < maxAttempts - 1) {
      const retryAfter = Number(response.headers.get("retry-after"))
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1200 * (attempt + 1)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      continue
    }
    if (response.status >= 500 && attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
      continue
    }
    if (response.status === 429) throw new Error("The AI provider is temporarily rate limited. Try again in a moment.")
    throw new Error(`AI service returned ${response.status}`)
  }
  throw new Error("AI service retry limit reached.")
}

async function generateAndReviewCards(params: { apiKey: string; term: string; generatorModel: string; fallbackGeneratorModel?: string; reviewerModel: string }) {
  const qualityRules = "RegencyLab means grammatical regency/complementation (valency), NOT the historical Regency era. Use short, modern, neutral everyday or professional examples; never theme examples around dukes, estates, carriages, aristocracy, drawing rooms, inheritance, or period society. Include the term's most frequent core construction before secondary constructions. The pattern starts immediately after the card-front term: never include its subject. Preserve an object placeholder only when the term requires an object after it, as in `someone + of + noun/-ing` for accuse, `someone/something + from + -ing` for prevent, `someone + of/to/that + complement` for remind, `someone + with + noun` for provide, and `noun + to + noun` for pay something to a recipient. In contrast, write `from + noun` for suffer, `in + -ing` for succeed, `to + noun` for belong, and `of + noun` for consist. Exclude rare senses such as `succeed to a title`, lexical collocations such as `pay attention`, and optional adjuncts such as `suffer in silence`; they are not target regency cards. The example must demonstrate every slot in the pattern, and meaningPt must describe the exact sense demonstrated by that example."
  const system = "You create concise English regency flashcards with natural Brazilian Portuguese teaching notes. Return JSON only. Include every distinct modern, common learner-relevant construction, but never rare, archaic, highly formal, obsolete, or speculative constructions. The card front already contains the term, so its pattern must contain only what follows the term. Generate the whole term family together. Every English example and its PT-BR translation must express exactly the same meaning. meaningPt must be one short, concrete PT-BR sentence explaining when or why that construction is used. contrastPt must briefly distinguish it from a real sibling pattern in this same output; use an empty string when there is no useful sibling contrast. Classify grammaticalForm independently from category as base-form, comparative, superlative, plural, past, past-participle, present-participle, or third-person-singular."
  const task = `Create all common regency cards for the exact English term "${params.term}". Return one object per distinct construction, each with category and grammaticalForm plus its own English example, natural Brazilian Portuguese translation, concise meaningPt and family-aware contrastPt. The example must contain the exact written term and demonstrate its selected pattern. The pattern MUST NOT repeat "${params.term}"; use "to + infinitive", not "${params.term} + to + infinitive". Return at most 4 cards as {"cards":[{"category":"verb|adjective|noun","grammaticalForm":"base-form","pattern":"to + infinitive","complement":"infinitive","example":"I struggle to balance work and family commitments.","exampleTranslation":"Eu luto para equilibrar o trabalho e os compromissos familiares.","meaningPt":"Indica uma ação realizada com grande esforço ou dificuldade.","contrastPt":"Diferente de with + noun, que apresenta a dificuldade enfrentada."}]}. Do not include duplicate patterns, vague or repetitive explanations, alternative senses without a governed construction, or relative clauses masquerading as complements.`
  let usedFallback = false
  let generatedRaw: unknown
  try {
    generatedRaw = await callModel(params.apiKey, params.generatorModel, `${system} ${qualityRules}`, `${task}\n${qualityRules}`, 1000, 2)
  } catch (error) {
    const isRateLimited = error instanceof Error && error.message.includes("rate limited")
    if (isRateLimited && params.fallbackGeneratorModel && params.fallbackGeneratorModel !== params.generatorModel) {
      usedFallback = true
      generatedRaw = await callModel(params.apiKey, params.fallbackGeneratorModel, `${system} ${qualityRules}`, `${task}\n${qualityRules}`, 1000)
    } else {
      generatedRaw = await callModel(
        params.apiKey,
        params.generatorModel,
        `${system} ${qualityRules}`,
        `${task}\n${qualityRules}\nThe previous response was unusable. Return the required JSON schema exactly and include only structurally valid common constructions.`,
        1000,
        2,
      )
    }
  }
  const sanitizeGeneratedFamily = (raw: unknown) => {
    const rawCards: unknown[] = raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).cards)
      ? (raw as Record<string, unknown>).cards as unknown[]
      : []
    return rawCards
      .map((value) => sanitizePayload(value, params.term))
      .filter((value): value is RegencyPayload => value !== null)
      .filter((value, index, values) => values.findIndex((candidate) => normalized(candidate.pattern) === normalized(value.pattern)) === index)
      .slice(0, 4)
  }
  let generated = sanitizeGeneratedFamily(generatedRaw)
  if (!generated.length) {
    generatedRaw = await callModel(
      params.apiKey,
      params.generatorModel,
      `${system} ${qualityRules}`,
      `${task}\n${qualityRules}\nYour previous candidates did not pass structural validation. Every example must contain the exact term "${params.term}" and visibly demonstrate the connector written in pattern.`,
      1000,
      2,
    )
    generated = sanitizeGeneratedFamily(generatedRaw)
  }
  if (!generated.length && params.reviewerModel !== params.generatorModel) {
    generatedRaw = await callModel(
      params.apiKey,
      params.reviewerModel,
      `${system} ${qualityRules}`,
      `${task}\n${qualityRules}\nAct as the recovery lexicographer. Return at least the single most frequent, modern, structurally complete construction for "${params.term}" using the exact JSON schema.`,
      1000,
      3,
    )
    generated = sanitizeGeneratedFamily(generatedRaw)
  }
  if (!generated.length) throw new Error("No common construction passed structural validation.")

  let reviewedRaw = await callModel(
    params.apiKey,
    params.reviewerModel,
    "You are a strict English lexicographer, Brazilian Portuguese translator and language teacher. Return JSON only. Review the candidate family as one coherent set. Approve only genuine, modern, common valency/regency constructions whose example, translation and meaningPt agree. Verify category and grammaticalForm independently; grammaticalForm must match the exact written term and must never replace category. Reject or correct vague meanings, repeated teaching notes, false sibling contrasts, incorrect categories, grammatical forms, patterns, complements, translations, rare usage, duplicates, or relative clauses masquerading as complements. contrastPt may reference only patterns actually present in this candidate family and must be empty for a one-card family.",
    `Review the complete candidate family for the exact term "${params.term}": ${JSON.stringify(generated)}. Return {"reviews":[{"valid":true,"card":{"category":"verb","grammaticalForm":"base-form","pattern":"to + infinitive","complement":"infinitive","example":"I struggle to balance work and family commitments.","exampleTranslation":"Eu luto para equilibrar o trabalho e os compromissos familiares.","meaningPt":"Indica uma ação realizada com grande esforço ou dificuldade.","contrastPt":"Diferente de with + noun, que apresenta a dificuldade enfrentada."}},{"valid":false,"reason":"brief reason"}],"missingCards":[]}. Keep review order aligned with the candidates and return the complete corrected card whenever valid. The pattern is only what follows the term and must never repeat it. Reject noun + that patterns when "that" introduces a relative clause instead of a genuine complement.\n${qualityRules}\nIf the candidates omit the term's most frequent modern core construction, create it as a complete corrected card in missingCards; otherwise return an empty missingCards array. Add at most two missing cards.`,
    1200,
  )
  let rawReviews: unknown[] = reviewedRaw && typeof reviewedRaw === "object" && Array.isArray((reviewedRaw as Record<string, unknown>).reviews)
    ? (reviewedRaw as Record<string, unknown>).reviews as unknown[]
    : []
  // A compact reviewer can occasionally reject an entire valid family. Audit
  // a zero-approval result once with the generator model before discarding
  // common constructions such as "abide by" or "approve of".
  if (
    params.reviewerModel !== params.generatorModel &&
    !rawReviews.some((review) => review && typeof review === "object" && (review as Record<string, unknown>).valid === true)
  ) {
    reviewedRaw = await callModel(
      params.apiKey,
      params.generatorModel,
      "You are the final English valency auditor. Return JSON only. Keep every genuine, modern, common construction. Correct a candidate when its wording, translation, complement or teaching note can be repaired; reject it only when the construction itself is false or rare. Return exactly one review per candidate in the same order.",
      `Audit the exact term "${params.term}" and these candidates: ${JSON.stringify(generated)}. Return {"reviews":[{"valid":true,"card":{"category":"verb|adjective|noun","grammaticalForm":"base-form","pattern":"by + noun","complement":"noun","example":"We must abide by the rules.","exampleTranslation":"Devemos cumprir as regras.","meaningPt":"Indica cumprimento de uma regra ou decisão.","contrastPt":""}},{"valid":false,"reason":"brief reason"}]}. Preserve only patterns that are genuinely governed by the term.\n${qualityRules}`,
      1200,
    )
    rawReviews = reviewedRaw && typeof reviewedRaw === "object" && Array.isArray((reviewedRaw as Record<string, unknown>).reviews)
      ? (reviewedRaw as Record<string, unknown>).reviews as unknown[]
      : []
  }
  const reviewedCards = generated.flatMap((candidate, index) => {
    const review = rawReviews[index] as Record<string, unknown> | undefined
    if (!review || review.valid !== true) return []
    const corrected = review.card ? sanitizePayload(review.card, params.term) : candidate
    return corrected ? [corrected] : []
  }).filter((value, index, values) => values.findIndex((candidate) => normalized(candidate.pattern) === normalized(value.pattern)) === index)
  const missingCardsRaw = reviewedRaw && typeof reviewedRaw === "object" && Array.isArray((reviewedRaw as Record<string, unknown>).missingCards)
    ? (reviewedRaw as Record<string, unknown>).missingCards as unknown[]
    : []
  const missingCards = missingCardsRaw
    .map((candidate) => sanitizePayload(candidate, params.term))
    .filter((candidate): candidate is RegencyPayload => candidate !== null)
  const reviewedFamily = [...reviewedCards, ...missingCards]
    .filter((value, index, values) => values.findIndex((candidate) => normalized(candidate.pattern) === normalized(value.pattern)) === index)
    .slice(0, 4)
  // Two independent model passes have already run. If both return a malformed
  // all-reject response, preserve the structurally validated generator family
  // instead of making a common term impossible to create.
  const cards = reviewedFamily.length > 0 ? reviewedFamily : generated
  const familyCards = cards.length === 1 ? cards.map((card) => ({ ...card, contrastPt: "" })) : cards
  return {
    cards: familyCards,
    rejectedCount: generated.length - reviewedCards.length,
    usedFallback,
    usedReviewFallback: reviewedCards.length === 0,
  }
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "ai:regency", { limit: 20 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(request, 150_000)
    const action = body?.action === "example" || body?.action === "card" ? body.action : "suggest"
    const term = typeof body?.term === "string" ? body.term.trim() : ""
    const category = typeof body.category === "string" && categories.includes(body.category as RegencyCategory)
      ? body.category as RegencyCategory
      : "verb"
    const pattern = typeof body?.pattern === "string" ? body.pattern.trim() : ""
    const complement = typeof body.complement === "string" && complements.includes(body.complement as RegencyComplement)
      ? body.complement as RegencyComplement
      : "other"
    const familyPatterns: string[] = Array.isArray(body?.familyPatterns)
      ? Array.from(new Set<string>((body.familyPatterns as unknown[]).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))).slice(0, 12)
      : []
    if (!term) return NextResponse.json({ error: "term is required" }, { status: 400 })
    if (action === "example" && !pattern) return NextResponse.json({ error: "pattern is required" }, { status: 400 })

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return NextResponse.json({ error: "AI suggestions are not configured." }, { status: 503 })
    const generatorModel = process.env.REGENCY_AI_MODEL ?? process.env.DEFAULT_AI_MODEL ?? "ibm-granite/granite-4.1-8b"
    const fallbackGeneratorModel = process.env.REGENCY_GENERATOR_FALLBACK_MODEL
    const reviewerModel = process.env.REGENCY_REVIEW_AI_MODEL ?? generatorModel

    if (action === "card") {
      const result = await generateAndReviewCards({ apiKey, term, generatorModel, fallbackGeneratorModel, reviewerModel })
      if (!result.cards.length) return NextResponse.json({ error: "The reviewer did not approve any common construction for this term." }, { status: 422 })
      return NextResponse.json({ ...result, reviewed: true })
    }

    const task = action === "suggest"
      ? `Return 1 to 3 genuine English valency/regency patterns for the ${category} "${term}". Classify its grammaticalForm independently from category. Only include established constructions. Generate each English example, its natural Brazilian Portuguese translation, a short concrete meaningPt, and a contrastPt only when another pattern in the returned or existing family makes a useful comparison. Existing family patterns: ${JSON.stringify(familyPatterns)}. Each example must use the exact written term "${term}" and the pattern. Do not invent uncommon senses.`
      : `Write one natural English example that uses the exact written ${category} "${term}" with this selected construction: "${pattern}" (${complement}), classify grammaticalForm independently, plus its natural Brazilian Portuguese translation and a short concrete meaningPt. Existing sibling patterns: ${JSON.stringify(familyPatterns.filter((value) => normalized(value) !== normalized(pattern)))}. Write contrastPt only if one of those real siblings provides a useful distinction; otherwise return an empty string. Do not change the construction or infer a different sense.`
    const raw = await callModel(
      apiKey,
      generatorModel,
      "You are an English valency reference assistant, Brazilian Portuguese translator and concise language teacher. Return JSON only. Never describe a pattern as valid unless it is an established construction. category and grammaticalForm are independent; grammaticalForm is one of base-form, comparative, superlative, plural, past, past-participle, present-participle, third-person-singular. Every exampleTranslation must naturally translate the English example. meaningPt must explain when or why to use the pattern in one short PT-BR sentence. contrastPt must be concise, non-repetitive, and may mention only a supplied or returned sibling pattern; otherwise it must be an empty string.",
      `${task}\nReturn ${action === "suggest" ? '{"suggestions":[{"category":"verb","grammaticalForm":"base-form","pattern":"to + infinitive","complement":"infinitive","example":"I struggle to balance work and family commitments.","exampleTranslation":"Eu luto para equilibrar o trabalho e os compromissos familiares.","meaningPt":"Indica uma ação realizada com grande esforço ou dificuldade.","contrastPt":"Diferente de with + noun, que apresenta a dificuldade enfrentada."}]}' : '{"category":"verb","grammaticalForm":"base-form","pattern":"to + infinitive","complement":"infinitive","example":"I struggle to balance work and family commitments.","exampleTranslation":"Eu luto para equilibrar o trabalho e os compromissos familiares.","meaningPt":"Indica uma ação realizada com grande esforço ou dificuldade.","contrastPt":""}'}`,
      action === "suggest" ? 700 : 320,
    )

    if (action === "suggest") {
      const rawSuggestions: unknown[] = raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).suggestions)
        ? (raw as Record<string, unknown>).suggestions as unknown[]
        : []
      const suggestions = rawSuggestions.map((item) => sanitizePayload(item, term)).filter((item): item is RegencyPayload => item !== null).slice(0, 3)
      if (suggestions.length === 1 && familyPatterns.length === 0) suggestions[0].contrastPt = ""
      return NextResponse.json({ suggestions })
    }

    const suggestion = sanitizePayload(raw, term)
    if (!suggestion || normalized(suggestion.pattern) !== normalized(pattern)) {
      return NextResponse.json({ error: "The example could not be validated for the selected pattern." }, { status: 422 })
    }
    return NextResponse.json({ suggestion, compatible: true })
  } catch (error) {
    return safeApiError(error, "Could not generate a regency suggestion.")
  }
}
