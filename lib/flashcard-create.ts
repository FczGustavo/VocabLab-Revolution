import type { Flashcard, PartOfSpeech } from "./types"
import type { FlashcardAIResponse } from "./openai"
import { filterArchaicAlternativeForms, MAX_LEARNER_DERIVATIONS } from "./openai"
import { partitionDerivationsForValidation } from "./derivation-validation"
import { normalizeGrammaticalForm } from "./grammatical-forms"
export { filterArchaicAlternativeForms }
import { readAllFlashcardsFromDB } from "@/hooks/use-flashcards-db"

// ──────────────────────────────────────────────────────────────────────────
// Shared flashcard creation pipeline — used by both VocabLab (AddFlashcardForm
// + FlashcardsPage) and ReadLab (ReadTextView). Keeps cards from both sides
// identical: same AI call, same normalization, same family propagation, same
// background alternative-POS enrichment.
//
// Previously this logic lived inline in components/flashcards-page.tsx and was
// NOT reused by ReadLab, so ReadLab-originated cards missed family merging
// and the alternative-POS enrichment. Now both go through createCardFromAI().
// ──────────────────────────────────────────────────────────────────────────

export function normalizeFamilyKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
}

/**
 * Family membership is lexical data, not a spelling heuristic. The former
 * suffix-stripping implementation conflated unrelated words and also missed
 * irregular families such as quick → quicken. New cards carry familyKey from
 * the lexicographer. Old cards use only explicit derivation links as a
 * compatibility fallback; no prefix or suffix guessing is performed.
 */
export function getFamilyMembers(word: string, allFlashcards: Flashcard[], familyKey?: string): Flashcard[] {
  const target = normalizeFamilyKey(word)
  const targetCard = allFlashcards.find((card) => normalizeFamilyKey(card.word) === target)
  const targetKey = normalizeFamilyKey(familyKey ?? targetCard?.familyKey ?? "")

  if (targetKey) {
    return allFlashcards.filter((card) => normalizeFamilyKey(card.familyKey ?? "") === targetKey)
  }

  const graph = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!graph.has(a)) graph.set(a, new Set())
    if (!graph.has(b)) graph.set(b, new Set())
    graph.get(a)!.add(b)
    graph.get(b)!.add(a)
  }
  for (const card of allFlashcards) {
    const cardWord = normalizeFamilyKey(card.word)
    if (!graph.has(cardWord)) graph.set(cardWord, new Set())
    for (const form of card.alternativeForms ?? []) link(cardWord, normalizeFamilyKey(form.word))
  }
  const visited = new Set<string>([target])
  const queue = [target]
  while (queue.length) {
    const current = queue.shift()!
    for (const neighbor of graph.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return allFlashcards.filter((card) => visited.has(normalizeFamilyKey(card.word)))
}

export function filterAlternativesByDeck(
  alternatives: Flashcard["alternativeForms"],
  allFlashcards: Flashcard[],
  excludeWord?: string,
  excludePos?: string
): Flashcard["alternativeForms"] {
  const invalidPos = new Set(["interjection", "idiom", "acronym", "phrasal-verb"])
  const existingWordPos = new Set(allFlashcards.map((f) => `${f.word.toLowerCase()}::${f.partOfSpeech}`))
  const seen = new Set<string>()
  return (alternatives || []).filter((alt) => {
    if (!alt.word || !alt.partOfSpeech) return false
    if (invalidPos.has(alt.partOfSpeech)) return false
    if (existingWordPos.has(`${alt.word.toLowerCase()}::${alt.partOfSpeech}`)) return false
    if (excludeWord && excludePos && alt.word.toLowerCase() === excludeWord.toLowerCase() && alt.partOfSpeech === excludePos) return false
    const key = `${alt.word.toLowerCase()}::${alt.partOfSpeech}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, MAX_LEARNER_DERIVATIONS)
}

// Ask the mini validator model whether each candidate family member is
// genuinely related to the base word. Returns the subset that the model
// confirms. Falls back to the full list when the validator is unreachable
// (fail-open: better to propagate to a possibly-unrelated card than to
// silently break the feature).
export async function validateFamilyMembers(
  baseWord: string,
  basePos: string,
  candidates: Flashcard[]
): Promise<Flashcard[]> {
  if (candidates.length === 0) return []
  const baseKey = normalizeFamilyKey(
    candidates.find(
      (card) =>
        normalizeFamilyKey(card.word) === normalizeFamilyKey(baseWord) &&
        (!basePos || card.partOfSpeech === basePos)
    )?.familyKey ?? ""
  )
  // A reviewed familyKey is the source of truth for modern cards. Re-asking a
  // model here made a valid multi-member family depend on whichever individual
  // forms the validator happened to remember (for example, keeping quickly but
  // dropping quicken). Legacy cards without this key still use validation.
  if (baseKey) {
    return candidates.filter((card) => normalizeFamilyKey(card.familyKey ?? "") === baseKey)
  }
  const partition = partitionDerivationsForValidation(baseWord, candidates)
  if (partition.candidates.length === 0) return partition.trusted
  try {
    const res = await fetch("/api/ai/validate-derivations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseWord,
        basePartOfSpeech: basePos,
        derivations: partition.candidates.map((c) => ({
          word: c.word,
          partOfSpeech: c.partOfSpeech,
        })),
      }),
    })
    // Never merge families on an unverified heuristic. Missing a merge is
    // recoverable; copying a bad derivation into several cards is not.
    if (!res.ok) return []
    const data = (await res.json()) as {
      valid: { word: string; partOfSpeech: string }[]
      invalid: { word: string; reason: string }[]
      validatorError?: string
    }
    if (data.validatorError) return []
    const validSet = new Set(
      data.valid.map((v) => `${v.word.toLowerCase()}::${v.partOfSpeech}`)
    )
    return [...partition.trusted, ...partition.candidates.filter((c) =>
      validSet.has(`${c.word.toLowerCase()}::${c.partOfSpeech}`)
    )]
  } catch {
    return []
  }
}

export async function propagateDerivationToFamily(
  derivation: Flashcard["alternativeForms"][number],
  word: string,
  allFlashcards: Flashcard[],
  updateFlashcard: (card: Flashcard) => Promise<boolean>
) {
  const freshDeck = await readAllFlashcardsFromDB()
  const heuristicFamily = getFamilyMembers(word, freshDeck)
  // Validate family membership with the mini model before propagating. This
  // prevents the heuristic from merging unrelated words that share a 2-3
  // char prefix (e.g. "alive" -> root "al" <- "almost").
  const family = (await validateFamilyMembers(word, "", heuristicFamily)).filter(
    (member) => member.word.toLowerCase() !== word.toLowerCase()
  )
  for (const member of family) {
    const existing = filterArchaicAlternativeForms<Flashcard["alternativeForms"][number]>(member.alternativeForms || [])
    const alreadyHasThis = existing.some(
      (d: any) => d.word.toLowerCase() === derivation.word.toLowerCase() && d.partOfSpeech === derivation.partOfSpeech
    )
    if (alreadyHasThis) continue
    const deckHasCard = freshDeck.some(
      (f: Flashcard) => f.word.toLowerCase() === derivation.word.toLowerCase() && f.partOfSpeech === derivation.partOfSpeech
    )
    if (deckHasCard) continue
    const conflictIdx = existing.findIndex((d: any) => d.partOfSpeech === derivation.partOfSpeech)
    if (conflictIdx >= 0) {
      const updated = [...existing]
      updated[conflictIdx] = derivation
      await updateFlashcard({ ...member, alternativeForms: updated })
    } else {
      await updateFlashcard({ ...member, alternativeForms: [...existing, derivation] })
    }
  }
}

function isExpandedAcronymInput(raw: string): boolean {
  const normalized = raw.trim()
  return /^.+\s+\([a-z0-9]{2,}\)$/i.test(normalized)
}

export function aiResponseToFlashcard(data: FlashcardAIResponse, sourceWord: string, preserveSourceForm = false): Flashcard {
  const typedWord = sourceWord.trim().replace(/\s+/g, " ")
  const keepTypedWord = isExpandedAcronymInput(typedWord)

  return {
    id: crypto.randomUUID(),
    word: keepTypedWord || preserveSourceForm ? typedWord.toLowerCase() : data.normalizedWord.toLowerCase(),
    partOfSpeech: data.partOfSpeech as PartOfSpeech,
    grammaticalForm: normalizeGrammaticalForm(data.grammaticalForm),
    translation: data.translation,
    ipa: data.ipa || "",
    usageNote: data.usageNote || "",
    usageNoteEn: data.usageNoteEn || "",
    synonyms: data.synonyms,
    antonyms: data.antonyms,
    example: data.example,
    exampleTranslation: (data as any).exampleTranslation || "",
    alternativeForms: filterArchaicAlternativeForms(
      (data.alternativeForms || []).map((f) => ({
        ...f,
        partOfSpeech: f.partOfSpeech as PartOfSpeech,
      })),
      data.normalizedWord || typedWord
    ),
    conjugations: data.conjugations ?? undefined,
    verbType: data.verbType ?? undefined,
    falseCognate: undefined,
    familyKey: normalizeFamilyKey(data.familyKey || data.normalizedWord),
    usageStatus: data.usageStatus ?? "current",
    folderId: null,
    createdAt: Date.now(),
  }
}

export interface CreateCardOptions {
  includeSynonymsAntonyms: boolean
  synonymsLevel: 0 | 1 | 2 | 3
  includeConjugations: boolean
  includeAlternativeForms: boolean
  includeUsageNote: boolean
  includeIpa: boolean
  efommMode: boolean
  includeMultipleTranslations?: boolean
  /** Prefer a second pt-BR equivalent only when it is interchangeable in context. */
  preferContextualAlternativeTranslation?: boolean
  preferredTranslation?: string
  targetPartOfSpeech?: PartOfSpeech
  existingPartsOfSpeech?: PartOfSpeech[]
  /** Contextual source used by ReadLab to preserve the selected sense. */
  sourceContext?: string
  /** Keep the exact selected inflected form as the visible card headword. */
  preserveSourceForm?: boolean
  /** Generate a short example for the ReadLab sense instead of copying a long sentence. */
  conciseSourceExample?: boolean
}

export interface CreateCardHooks {
  addFlashcard: (flashcard: Flashcard, explicitFolderId?: string | null) => Promise<boolean>
  updateFlashcard: (flashcard: Flashcard) => Promise<boolean>
  // The current full deck (from useFlashcardsDB().allFlashcards). Used for
  // alternative-forms filtering.
  allFlashcards: Flashcard[]
}

export interface CreateCardResult {
  ok: boolean
  duplicate: boolean
  flashcard: Flashcard
  error?: string
}

// The single entry point for "create a card from a word/phrase via AI". Used by
// VocabLab's AddFlashcardForm and ReadLab's ReadTextView so cards from both
// surfaces are identical.
//
// Flow:
// 1. POST /api/ai/flashcard with the user's model + options
// 2. Convert the AI response to a Flashcard (aiResponseToFlashcard)
// 3. Filter alternative forms against the current deck
// 4. addFlashcard (with the explicit target folder)
// 5. Family propagation: merge canonical alt-forms across same-root cards
// 6. Background alternative-POS fetch (when enabled and not idiom/acronym)
export async function createCardFromAI(args: {
  word: string
  model: string
  options: CreateCardOptions
  targetFolderId: string | null
  hooks: CreateCardHooks
}): Promise<CreateCardResult> {
  const { word, model, options, targetFolderId, hooks } = args
  const { addFlashcard, updateFlashcard, allFlashcards } = hooks

  try {
    const currentDeck = await readAllFlashcardsFromDB().catch(() => allFlashcards)
    const normalizedInput = word.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
    const existingPartsOfSpeech = options.targetPartOfSpeech
      ? options.existingPartsOfSpeech ?? []
      : [...new Set([
          ...(options.existingPartsOfSpeech ?? []),
          ...currentDeck
            .filter((card) => card.word.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") === normalizedInput)
            .map((card) => card.partOfSpeech),
        ])]
    const res = await fetch("/api/ai/flashcard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word,
        model,
        options: {
          includeSynonymsAntonyms: options.includeSynonymsAntonyms,
          synonymsLevel: options.synonymsLevel,
          includeConjugations: options.includeConjugations,
          includeAlternativeForms: options.includeAlternativeForms,
          includeUsageNote: options.includeUsageNote,
          includeIpa: options.includeIpa,
          efommMode: options.efommMode,
          includeMultipleTranslations: options.includeMultipleTranslations ?? true,
          preferContextualAlternativeTranslation: options.preferContextualAlternativeTranslation,
          preferredTranslation: options.preferredTranslation,
          sourceContext: options.sourceContext,
          preserveSourceForm: options.preserveSourceForm,
          conciseSourceExample: options.conciseSourceExample,
          existingPartsOfSpeech,
          ...(options.targetPartOfSpeech ? { targetPartOfSpeech: options.targetPartOfSpeech } : {}),
        },
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json?.error || "Failed to generate card")
    }
    const data: FlashcardAIResponse = await res.json()

    const flashcard = aiResponseToFlashcard(data, word, options.preserveSourceForm)

    // Deterministic archaic/coherence filter runs first — independent of any
    // model. Removes known bad combinations (quick/noun, alive/noun) and
    // noun alt-forms with verb translations (keep/noun → "manter/guardar").
    let validatedAlternativeForms = options.includeAlternativeForms
      ? filterArchaicAlternativeForms<Flashcard["alternativeForms"][number]>(flashcard.alternativeForms || [])
      : []

    // Validate remaining derivations against the mini model (catches
    // hallucinated or unrelated words that the deterministic filter misses).
    if (options.includeAlternativeForms && !data.derivationsValidated && validatedAlternativeForms.length > 0) {
      try {
        const validationRes = await fetch("/api/ai/validate-derivations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseWord: flashcard.word,
            basePartOfSpeech: flashcard.partOfSpeech,
            derivations: validatedAlternativeForms.map((d: any) => ({
              word: d.word,
              partOfSpeech: d.partOfSpeech,
            })),
          }),
        })
        if (validationRes.ok) {
          const validation = (await validationRes.json()) as {
            valid: { word: string; partOfSpeech: string }[]
            invalid: { word: string; reason: string }[]
            validatorError?: string
          }
          if (!validation.validatorError) {
            const validSet = new Set(
              validation.valid.map((v) => `${v.word.toLowerCase()}::${v.partOfSpeech}`)
            )
            validatedAlternativeForms = validatedAlternativeForms.filter((d: any) =>
              validSet.has(`${d.word.toLowerCase()}::${d.partOfSpeech}`)
            )
          } else {
            validatedAlternativeForms = []
          }
        } else {
          validatedAlternativeForms = []
        }
      } catch {
        validatedAlternativeForms = []
        // Validator unreachable — keep the AI's original derivations rather
        // than silently dropping them. The user can prune by hand.
      }
    }

    const filteredFlashcard: Flashcard = {
      ...flashcard,
      alternativeForms: filterAlternativesByDeck(
        validatedAlternativeForms,
        allFlashcards
      ),
    }

    const ok = await addFlashcard(filteredFlashcard, targetFolderId)
    if (!ok) {
      return { ok: false, duplicate: true, flashcard: filteredFlashcard }
    }

    // With "Outras formas" disabled, stop here: no family discovery,
    // validation, propagation, or alternative-POS background request.
    if (!options.includeAlternativeForms) {
      return { ok: true, duplicate: false, flashcard: filteredFlashcard }
    }

    // IMPORTANT: from here on, use a copy of `flashcard` that carries the
    // target folderId. `aiResponseToFlashcard` sets folderId: null, and
    // although `updateFlashcard` has logic to preserve the existing folderId
    // from the DB, passing it explicitly is safer (avoids any race condition
    // where the DB read in updateFlashcard might not see the just-added
    // record's folderId yet).
    const flashcardWithFolder: Flashcard = { ...flashcard, folderId: targetFolderId }

    // Family propagation — same logic that FlashcardsPage.handleAddWord does.
    const freshDeck = await readAllFlashcardsFromDB()
    // First use the heuristic to find candidates, then VALIDATE each one with
    // the mini model before merging their derivations. Without this, the
    // heuristic `startsWith` groups unrelated words that share a 2-3 char
    // prefix (e.g. "alive" -> root "al" matches "almost", causing the two
    // cards to swap derivations).
    const heuristicFamily = getFamilyMembers(flashcardWithFolder.word, freshDeck)
    const family = await validateFamilyMembers(
      flashcardWithFolder.word,
      flashcardWithFolder.partOfSpeech,
      heuristicFamily
    )
    const canonicalByPOS = new Map<string, Flashcard["alternativeForms"][number]>()
    for (const member of family) {
      for (const d of member.alternativeForms || []) {
        if (d.partOfSpeech !== flashcardWithFolder.partOfSpeech && !canonicalByPOS.has(d.partOfSpeech)) {
          canonicalByPOS.set(d.partOfSpeech, d)
        }
      }
    }
    let currentAlts = [...(filteredFlashcard.alternativeForms || [])]
    for (const [pos, canonical] of canonicalByPOS) {
      const hasConflict = currentAlts.some((d) => d.partOfSpeech === pos)
      if (hasConflict) {
        currentAlts = currentAlts.filter((d) => d.partOfSpeech !== pos)
      }
      const alreadyHas = currentAlts.some(
        (d) => d.word.toLowerCase() === canonical.word.toLowerCase() && d.partOfSpeech === canonical.partOfSpeech
      )
      if (!alreadyHas) {
        currentAlts = [...currentAlts, canonical]
      }
    }
    currentAlts = filterAlternativesByDeck(
      filterArchaicAlternativeForms<Flashcard["alternativeForms"][number]>(currentAlts),
      freshDeck,
      flashcardWithFolder.word,
      flashcardWithFolder.partOfSpeech
    )
    await updateFlashcard({ ...flashcardWithFolder, alternativeForms: currentAlts })

    for (const alt of currentAlts) {
      propagateDerivationToFamily(alt, flashcardWithFolder.word, freshDeck, updateFlashcard)
    }

    // Background alternative-POS fetch (skip for idioms / acronyms, and when
    // the user disabled alternative forms).
    if (
      options.includeAlternativeForms &&
      flashcardWithFolder.partOfSpeech !== "idiom" &&
      flashcardWithFolder.partOfSpeech !== "phrasal-verb" &&
      flashcardWithFolder.partOfSpeech !== "acronym"
    ) {
      const existingAlts = currentAlts
      fetch("/api/ai/alternative-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: flashcardWithFolder.word, partOfSpeech: flashcardWithFolder.partOfSpeech, model }),
      })
        .then((r) => r.json())
        .then(async (data: { alternatives?: Flashcard["alternativeForms"] }) => {
          if (data.alternatives && data.alternatives.length > 0) {
            // Validate the alt-POS derivations through the same mini model
            // gate used at creation time, so the background enrichment can't
            // smuggle in unrelated words either.
            const partition = partitionDerivationsForValidation(
              flashcardWithFolder.word,
              data.alternatives
            )
            let altsToMerge = partition.trusted
            if (partition.candidates.length > 0) try {
              const validationRes = await fetch("/api/ai/validate-derivations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  baseWord: flashcardWithFolder.word,
                  basePartOfSpeech: flashcardWithFolder.partOfSpeech,
                  derivations: partition.candidates.map((d) => ({
                    word: d.word,
                    partOfSpeech: d.partOfSpeech,
                  })),
                }),
              })
              if (validationRes.ok) {
                const validation = (await validationRes.json()) as {
                  valid: { word: string; partOfSpeech: string }[]
                  invalid: { word: string; reason: string }[]
                  validatorError?: string
                }
                if (!validation.validatorError) {
                  const validSet = new Set(
                    validation.valid.map((v) => `${v.word.toLowerCase()}::${v.partOfSpeech}`)
                  )
                  altsToMerge = [...altsToMerge, ...partition.candidates.filter((d) =>
                    validSet.has(`${d.word.toLowerCase()}::${d.partOfSpeech}`)
                  )]
                }
              }
            } catch {
              // validator unreachable — keep the AI's proposals
            }
            const newAlts = filterAlternativesByDeck(
              filterArchaicAlternativeForms<Flashcard["alternativeForms"][number]>(altsToMerge),
              allFlashcards,
              flashcardWithFolder.word,
              flashcardWithFolder.partOfSpeech
            )
            const merged = [...existingAlts]
            for (const alt of newAlts) {
              if (
                !merged.some(
                  (e) =>
                    e.word.toLowerCase() === alt.word.toLowerCase() &&
                    e.partOfSpeech === alt.partOfSpeech
                )
              ) {
                merged.push(alt)
              }
            }
            updateFlashcard({ ...flashcardWithFolder, alternativeForms: merged }).then(() => {
              for (const alt of merged) {
                propagateDerivationToFamily(alt, flashcardWithFolder.word, allFlashcards, updateFlashcard)
              }
            })
          }
        })
        .catch(() => {})
    }

    return { ok: true, duplicate: false, flashcard: { ...flashcardWithFolder, alternativeForms: currentAlts } }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return {
      ok: false,
      duplicate: false,
      flashcard: {} as Flashcard,
      error: message,
    }
  }
}
