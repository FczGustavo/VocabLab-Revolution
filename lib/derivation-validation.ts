/**
 * Small, deterministic gate for the expensive lexical validator.
 *
 * It does not decide whether a word is a real derivation; it only identifies
 * entries whose relationship is not clear from their spelling. Clear forms
 * still pass through the local register, POS, duplicate, frequency, and
 * dictionary-headword checks in the creation pipeline.
 */
export interface DerivationCandidate {
  word: string
  partOfSpeech: string
}

export const MAX_AMBIGUOUS_DERIVATIONS = 5

function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
}

function sharedPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  let index = 0
  while (index < length && left[index] === right[index]) index += 1
  return index
}

function hasStableDerivationalStem(base: string, candidate: string): boolean {
  // Common spelling changes at a suffix boundary still preserve a clear root:
  // rely → reliable/reliability, apply → applicable, happy → happiness.
  // This is intentionally a tiny morphological rule, not a vocabulary list.
  const stems = [base]
  if (base.endsWith("y") && base.length >= 4) stems.push(`${base.slice(0, -1)}i`)
  if (base.endsWith("e") && base.length >= 5) stems.push(base.slice(0, -1))
  return stems.some((stem) => stem.length >= 4 && candidate.startsWith(stem))
}

/**
 * Same-spelling POS shifts and root-changing formations (act → action,
 * strong → strength, use → usable) need a lexicographic decision. A long,
 * stable shared stem (quick → quickly/quicken/quickness) is safe to leave to
 * the deterministic checks and avoids an unnecessary extra AI request.
 */
export function needsDerivationAIValidation(baseWord: string, candidateWord: string): boolean {
  const base = normalizeWord(baseWord)
  const candidate = normalizeWord(candidateWord)
  if (!base || !candidate || base === candidate) return true
  if (!/^[a-z]+$/i.test(base) || !/^[a-z]+$/i.test(candidate)) return true

  const shared = sharedPrefixLength(base, candidate)
  const shorter = Math.min(base.length, candidate.length)
  // A three-letter shared stem is enough to trust a proposal that already
  // survived the generator, reviewer, POS, frequency, and dictionary gates.
  // The AI validator remains for genuinely distant roots (alive → almost),
  // where a spelling heuristic is not meaningful.
  return !hasStableDerivationalStem(base, candidate) && (shared < 3 || shared / shorter < 0.45)
}

export function partitionDerivationsForValidation<T extends DerivationCandidate>(
  baseWord: string,
  derivations: T[]
): { trusted: T[]; candidates: T[]; omitted: T[] } {
  const trusted: T[] = []
  const ambiguous: T[] = []
  const seen = new Set<string>()

  for (const derivation of derivations) {
    const key = `${normalizeWord(derivation.word)}::${derivation.partOfSpeech.trim().toLowerCase()}`
    if (!derivation.word || !derivation.partOfSpeech || seen.has(key)) continue
    seen.add(key)
    if (needsDerivationAIValidation(baseWord, derivation.word)) ambiguous.push(derivation)
    else trusted.push(derivation)
  }

  return {
    trusted,
    candidates: ambiguous.slice(0, MAX_AMBIGUOUS_DERIVATIONS),
    // Never persist an unchecked overflow candidate. The next enrichment pass
    // can propose it again, while a wrong lexical-family link is costly.
    omitted: ambiguous.slice(MAX_AMBIGUOUS_DERIVATIONS),
  }
}
