// Pure helpers for ReadLab translation lookup. Shared between the in-memory
// dictionary (precomputed at text-save time) and the on-demand fallback.

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
}

// Strip leading/trailing punctuation from a single token but keep internal
// hyphens / apostrophes (e.g. "don't", "well-known").
function stripOuterPunct(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
}

// Very small English lemma guesser. We only need it to match a selected
// inflected form against a dictionary that may have stored the lemma (or
// vice-versa). Returns candidate lemmas for a single token.
export function lemmaCandidates(word: string): string[] {
  const w = stripOuterPunct(word.toLowerCase())
  if (!w) return []
  const out = new Set<string>()
  out.add(w)

  // Plurals / 3rd-person singular
  if (w.endsWith("ies") && w.length > 4) out.add(w.slice(0, -3) + "y")
  else if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) out.add(w.slice(0, -2))
  else if (w.endsWith("es") && w.length > 3) out.add(w.slice(0, -2))
  if (w.endsWith("s") && w.length > 2) out.add(w.slice(0, -1))

  // Past tense / participle
  if (w.endsWith("ied") && w.length > 4) out.add(w.slice(0, -3) + "y")
  else if (w.endsWith("ed") && w.length > 3) {
    out.add(w.slice(0, -2)) // walked -> walk
    out.add(w.slice(0, -1)) // baked -> bake
    if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) out.add(w.slice(0, -3)) // stopped -> stop
  }

  // Gerund / present participle
  if (w.endsWith("ing") && w.length > 5) {
    out.add(w.slice(0, -3)) // walking -> walk
    out.add(w.slice(0, -3) + "e") // baking -> bake
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) out.add(w.slice(0, -4)) // running -> run
  }

  // Comparatives / superlatives
  if (w.endsWith("ier") && w.length > 4) out.add(w.slice(0, -3) + "y")
  if (w.endsWith("iest") && w.length > 5) out.add(w.slice(0, -4) + "y")
  if (w.endsWith("er") && w.length > 3) out.add(w.slice(0, -2))
  if (w.endsWith("est") && w.length > 4) out.add(w.slice(0, -3))

  // Strip a leading "to " for infinitives used as selection.
  if (w.startsWith("to ") && w.length > 3) out.add(w.slice(3))

  return [...out].filter(Boolean)
}

// Tokenize a selection into "words" (stripping outer punctuation per token,
// dropping pure-punctuation tokens like commas / periods).
function tokenize(s: string): string[] {
  return s
    .split(/\s+/)
    .map(stripOuterPunct)
    .filter((t) => t.length > 0)
}

// Build a normalized lookup view of the translationMap: keys are normalized
// (lowercased, outer punctuation stripped, single-spaced) so we can compare
// against normalized selections. We memoize per-map by passing it in.
export type NormalizedMap = Map<string, string>

export function buildNormalizedMap(map: Record<string, string>): NormalizedMap {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(map)) {
    const nk = normalizeKey(k)
    if (nk && typeof v === "string" && v.trim()) {
      // First occurrence wins to keep deterministic behavior.
      if (!out.has(nk)) out.set(nk, v.trim())
    }
  }
  return out
}

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "by",
  "and", "or", "but", "if", "as", "than", "that", "this", "these", "those",
  "it", "its", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "will", "would", "could",
  "should", "may", "might", "shall", "can", "must", "not", "no",
])

export interface LookupResult {
  // The translation to display (may be null only when nothing was found AND
  // no on-demand call should be attempted — i.e. the selection is empty or
  // made up entirely of function words / punctuation).
  translation: string | null
  // True when the result came from joining individual word translations
  // (a degraded, "best-effort" answer). Useful for the UI to hint that an
  // on-demand call could yield a better translation.
  isJoinedFallback: boolean
  // True when we suggest firing the on-demand endpoint (no cached match at
  // all, or only a degraded joined fallback was found).
  shouldQueryOnDemand: boolean
}

export function lookupTranslation(
  map: NormalizedMap,
  selectedText: string
): LookupResult {
  const normalized = normalizeKey(selectedText)
  if (!normalized) {
    return { translation: null, isJoinedFallback: false, shouldQueryOnDemand: false }
  }

  // 1. Exact normalized match (handles "Word.", "WORD", leading/trailing
  // punctuation, multiple spaces, etc.).
  const exact = map.get(normalized)
  if (exact) {
    return { translation: exact, isJoinedFallback: false, shouldQueryOnDemand: false }
  }

  const tokens = tokenize(normalized)
  if (tokens.length === 0) {
    return { translation: null, isJoinedFallback: false, shouldQueryOnDemand: false }
  }

  // 2. Multi-word: sliding window from longest to 2-word phrases. This finds
  // phrasal verbs / collocations / idioms stored in the dictionary even when
  // the user selected a longer snippet that contains them.
  //
  // IMPORTANT: a partial phrase match (e.g. the dictionary has
  // "literacy was a boon" but the user selected a 12-word sentence) must NOT
  // be returned as the final answer — it would look "cut off". We only
  // accept a phrase match as final when it covers ~the entire selection.
  // Otherwise we show it as a degraded fallback and fire on-demand for a
  // real full translation.
  if (tokens.length > 1) {
    // Find the LONGEST stored phrase contained in the selection.
    let bestHit: string | null = null
    let bestLen = 0
    for (let len = tokens.length; len >= 2; len--) {
      if (len < bestLen) break // can't beat what we already have
      for (let start = 0; start <= tokens.length - len; start++) {
        const candidate = tokens.slice(start, start + len).join(" ")
        const hit = map.get(candidate)
        if (hit && len > bestLen) {
          bestLen = len
          bestHit = hit
        }
      }
    }

    if (bestHit) {
      const coverage = bestLen / tokens.length
      // Full (or nearly full) coverage → cached answer, instant.
      if (coverage >= 0.8) {
        return { translation: bestHit, isJoinedFallback: false, shouldQueryOnDemand: false }
      }
      // Partial coverage → show as degraded fallback but request the real
      // full translation on-demand. This is exactly the case where the old
      // dictionary has a sub-phrase of what the user actually selected.
      return {
        translation: bestHit,
        isJoinedFallback: true,
        shouldQueryOnDemand: true,
      }
    }

    // 2b. Try replacing ONE token at a time with its lemma, leaving the rest
    // untouched. This catches inflected selections matching stored lemmas
    // (e.g. "he runs fast" matching a stored "run fast") without exploding
    // combinatorially. Same coverage rule applies.
    let bestLemmaHit: string | null = null
    let bestLemmaLen = 0
    for (let i = 0; i < tokens.length; i++) {
      const lemmas = lemmaCandidates(tokens[i])
      for (const lemma of lemmas) {
        if (lemma === tokens[i]) continue
        for (let len = tokens.length; len >= 2; len--) {
          if (len < bestLemmaLen) break
          for (let start = 0; start <= tokens.length - len; start++) {
            if (start > i || i >= start + len) continue
            const candidate = tokens
              .slice(start, start + len)
              .map((t, idx) => (idx === i - start ? lemma : t))
              .join(" ")
            const hit = map.get(candidate)
            if (hit && len > bestLemmaLen) {
              bestLemmaLen = len
              bestLemmaHit = hit
            }
          }
        }
      }
    }
    if (bestLemmaHit) {
      const coverage = bestLemmaLen / tokens.length
      if (coverage >= 0.8) {
        return { translation: bestLemmaHit, isJoinedFallback: false, shouldQueryOnDemand: false }
      }
      return {
        translation: bestLemmaHit,
        isJoinedFallback: true,
        shouldQueryOnDemand: true,
      }
    }

    // 2c. Word-by-word fallback. Skip function words and punctuation. If we
    // find at least one content word with a translation, join with " · ".
    // BUT: for long selections this produces an unreadable wall of " · "-
    // separated words — pure noise. In that case skip the joined fallback
    // entirely and let the on-demand endpoint produce a real translation.
    const contentWordCount = tokens.filter((t) => !FUNCTION_WORDS.has(t)).length
    // Aligned with the endpoint's PASSAGE threshold so a sentence-sized
    // selection goes straight to on-demand instead of producing a noisy
    // " · "-joined pseudo-translation.
    const isLongSelection = contentWordCount > 6 || normalized.length > 60

    if (isLongSelection) {
      return {
        translation: null,
        isJoinedFallback: false,
        shouldQueryOnDemand: true,
      }
    }

    const parts: string[] = []
    for (const t of tokens) {
      if (FUNCTION_WORDS.has(t)) continue
      const direct = map.get(t)
      if (direct) {
        parts.push(direct)
        continue
      }
      const lemmaHit = lemmaCandidates(t).map((l) => map.get(l)).find(Boolean)
      if (lemmaHit) parts.push(lemmaHit)
    }

    if (parts.length > 0) {
      return {
        translation: parts.join(" · "),
        isJoinedFallback: true,
        shouldQueryOnDemand: parts.length < contentWordCount,
      }
    }

    // Nothing in the dictionary for this phrase — on-demand is the only path.
    return {
      translation: null,
      isJoinedFallback: false,
      shouldQueryOnDemand: true,
    }
  }

  // 3. Single word: try exact, then lemmas, then suggest on-demand.
  const direct = map.get(normalized)
  if (direct) {
    return { translation: direct, isJoinedFallback: false, shouldQueryOnDemand: false }
  }

  for (const lemma of lemmaCandidates(normalized)) {
    const hit = map.get(lemma)
    if (hit) return { translation: hit, isJoinedFallback: false, shouldQueryOnDemand: false }
  }

  // Function word with no entry — don't bother the model.
  if (FUNCTION_WORDS.has(normalized)) {
    return { translation: null, isJoinedFallback: false, shouldQueryOnDemand: false }
  }

  return { translation: null, isJoinedFallback: false, shouldQueryOnDemand: true }
}

// Extract a focused context window around the selected occurrence of `snippet`.
// A DOM-derived offset prevents repeated words from receiving the context of
// their first occurrence in the document.
export function extractFocusContext(
  fullText: string,
  snippet: string,
  opts?: { margin?: number; maxChars?: number; occurrenceStart?: number }
): string {
  const margin = opts?.margin ?? 160
  const maxChars = opts?.maxChars ?? 800

  if (!fullText) return ""
  if (!snippet) return fullText.slice(0, maxChars)

  // Prefer the exact occurrence captured by the DOM selection. Callers
  // without an offset retain the case-insensitive text-search fallback.
  const lowerFull = fullText.toLowerCase()
  const lowerSnippet = snippet.toLowerCase().trim()
  const requestedStart = opts?.occurrenceStart
  let idx =
    Number.isInteger(requestedStart) &&
    (requestedStart as number) >= 0 &&
    (requestedStart as number) < fullText.length
      ? requestedStart as number
      : lowerFull.indexOf(lowerSnippet)

  // If the exact snippet isn't found, try the first token (e.g. selection
  // included trailing punctuation that isn't in the source).
  if (idx === -1) {
    const firstToken = lowerSnippet.split(/\s+/)[0]
    if (firstToken) idx = lowerFull.indexOf(firstToken)
  }
  if (idx === -1) return fullText.slice(0, maxChars)

  const snippetEnd = idx + snippet.length

  // Expand to surrounding sentence boundaries so the model reads a complete
  // thought rather than a fragment. We look for the previous and next ".!?"
  // within a reasonable distance.
  const sentenceStart = (function () {
    const from = Math.max(0, idx - margin * 2)
    const window = fullText.slice(from, idx)
    const m = window.match(/[.!?]\s+/g)
    if (m && m.length > 0) {
      const lastMatch = window.lastIndexOf(m[m.length - 1])
      return from + lastMatch + m[m.length - 1].length
    }
    return from
  })()

  const sentenceEnd = (function () {
    const from = snippetEnd
    const to = Math.min(fullText.length, snippetEnd + margin * 2)
    const window = fullText.slice(from, to)
    const m = window.match(/[.!?]\s+/)
    if (m && m.index !== undefined) {
      return from + m.index + 1
    }
    return to
  })()

  let result = fullText.slice(sentenceStart, sentenceEnd).trim()
  if (result.length > maxChars) {
    // Center the snippet inside the cap.
    const localIdx = Math.max(0, idx - sentenceStart)
    const half = Math.floor((maxChars - snippet.length) / 2)
    const start = Math.max(0, localIdx - half)
    result = fullText.slice(sentenceStart + start, sentenceStart + start + maxChars).trim()
    if (start > 0) result = "… " + result
    if (sentenceStart + start + maxChars < sentenceEnd) result = result + " …"
  }
  return result
}

// Merge a patch returned by /api/readlab/lookup into a translationMap. Returns
// a NEW object (so React state updates trigger re-renders) and only writes keys
// that are not already present (existing entries win, to keep the bulk map
// authoritative).
export function mergePatch(
  map: Record<string, string>,
  patch: Record<string, string>
): Record<string, string> {
  let changed = false
  const next: Record<string, string> = { ...map }
  for (const [k, v] of Object.entries(patch)) {
    const nk = normalizeKey(k)
    if (!nk || typeof v !== "string" || !v.trim()) continue
    if (next[nk] === undefined) {
      next[nk] = v.trim()
      changed = true
    }
  }
  return changed ? next : map
}
