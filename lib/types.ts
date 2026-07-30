export interface ClassifiedWord {
  word: string
  type: "literal" | "figurative" | "slang" | "abstract"
}

export type PartOfSpeech = "verb" | "phrasal-verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection" | "acronym" | "idiom"
export type GrammaticalForm = "base-form" | "comparative" | "superlative" | "plural" | "past" | "past-participle" | "present-participle" | "third-person-singular"
export type LexicalUsageStatus = "current" | "rare" | "archaic"

export interface AlternativeForm {
  word: string
  partOfSpeech: PartOfSpeech
  grammaticalForm?: GrammaticalForm
  translation: string
  example: string
  usageNote?: string
  usageNoteEn?: string
  ipa?: string
}

export interface Folder {
  id: string
  name: string
  createdAt: number
  /** Last content change. Used by the cross-device conflict resolver. */
  updatedAt?: number
}

export interface Flashcard {
  id: string
  word: string
  partOfSpeech: PartOfSpeech
  grammaticalForm?: GrammaticalForm
  translation: string
  ipa?: string
  usageNote?: string
  usageNoteEn?: string
  synonyms: ClassifiedWord[]
  antonyms: ClassifiedWord[]
  example: string
  exampleTranslation?: string
  alternativeForms: AlternativeForm[]
  conjugations?: {
    simplePresent: string
    simplePast: string
    presentContinuous: string
    pastContinuous: string
    presentPerfect: string
    pastPerfect: string
  }
  verbType?: "regular" | "irregular"
  falseCognate?: {
    isFalseCognate: boolean
    warning: string // Ex: "Não significa 'pretender', significa 'fingir'"
  }
  aiEnriching?: boolean
  folderId: string | null
  isReviewFolder?: boolean
  audioSrc?: string
  /** Canonical headword for a morphological family (e.g. quick). */
  familyKey?: string
  /** Dictionary register of the exact word + POS stored on this card. */
  usageStatus?: LexicalUsageStatus
  /** Stable identifier for cards installed from a built-in curated catalog. */
  catalogId?: string
  /** Revision of the curated entry last applied to this card. */
  catalogRevision?: number
  /** Hash of catalog-owned content, used to preserve user edits on upgrades. */
  catalogContentHash?: string
  createdAt: number
  /** Last content change. Older cards may not have this field. */
  updatedAt?: number
}

export interface FlashcardAIResponse {
  normalizedWord: string
  partOfSpeech: PartOfSpeech
  grammaticalForm?: GrammaticalForm
  translation: string
  ipa?: string
  usageNote?: string
  usageNoteEn?: string
  synonyms: ClassifiedWord[]
  antonyms: ClassifiedWord[]
  example: string
  exampleTranslation?: string
  alternativeForms: AlternativeForm[]
  familyKey?: string
  usageStatus?: LexicalUsageStatus
  verbType?: "regular" | "irregular"
  falseCognate?: {
    isFalseCognate: boolean
    warning: string
  }
  conjugations?: {
    simplePresent: string
    simplePast: string
    presentContinuous: string
    pastContinuous: string
    presentPerfect: string
    pastPerfect: string
  }
}

export interface GrammarExercise {
  id: string
  type: "fill-blank" | "verb-conjugation"
  sentence: string
  answer: string
  hint?: string
  wordUsed: string
}

export interface GrammarExerciseSet {
  exercises: GrammarExercise[]
}

// ── GrammarLab MCQ system (EFOMM / EN / AFA style) ───────────────────────────

export interface GrammarQuestionOption {
  letter: "A" | "B" | "C" | "D" | "E"
  text: string
  /** true = this is the option the student must select */
  isAnswer: boolean
  /** per-option explanation shown after answering, in pt-BR */
  explanation: string
}

export interface GrammarQuestion {
  id: string
  topic: string
  subtopic?: string
  questionText: string
  /** Optional 1-2 sentence context passage to anchor article/pronoun/reference choices */
  contextPassage?: string
  /** "correct" = find the grammatically correct sentence; "incorrect" = find the error */
  questionType: "correct" | "incorrect"
  options: GrammarQuestionOption[]
  createdAt: number
}

export interface GrammarAnsweredRecord {
  questionId: string
  chosenLetter: string
  correct: boolean
  answeredAt: number
}

export interface GrammarFolder {
  id: string
  name: string
  createdAt: number
}

export interface GrammarList {
  id: string
  name: string
  folderId: string | null
  questionIds: string[]
  createdAt: number
}

// ── RuleLab manual cards ────────────────────────────────────────────────────

export interface RuleFolder {
  id: string
  name: string
  createdAt: number
}

export interface RuleCard {
  id: string
  front: string
  back: string
  folderId: string
  /** Virtual Review membership; the original folder remains unchanged. */
  isReviewFolder?: boolean
  createdAt: number
  updatedAt: number
}

// ── RegencyLab cards ──

export type RegencyCategory = "verb" | "adjective" | "noun"
export type RegencyComplement = "infinitive" | "gerund" | "noun" | "clause" | "prepositional-phrase" | "other"

export interface RegencyFolder {
  id: string
  name: string
  createdAt: number
}

export interface RegencyCard {
  id: string
  term: string
  category: RegencyCategory
  grammaticalForm?: GrammaticalForm
  /** The exact pattern the learner is expected to recall, e.g. "to + infinitive". */
  pattern: string
  complement: RegencyComplement
  example: string
  exampleTranslation?: string
  /** Short PT-BR explanation of when or why this construction is used. */
  meaningPt?: string
  /** Optional PT-BR contrast with sibling patterns from the same term family. */
  contrastPt?: string
  /** Virtual Review membership; the card remains in its original folder. */
  isReviewFolder?: boolean
  /** Stable identity of a card installed from the curated starter catalog. */
  catalogId?: string
  /** Catalog revision last applied to this card. */
  catalogRevision?: number
  /** Hash of the catalog-owned content at the last successful installation/update. */
  catalogContentHash?: string
  folderId: string | null
  createdAt: number
  updatedAt: number
}

// ── ReadLab types ────────────────────────────────────────────────────────────

export type ReadLabTag = "reading" | "read" | "pending"

export const READLAB_TAG_LABELS: Record<ReadLabTag, string> = {
  reading: "Reading",
  read: "Read",
  pending: "Pending",
}

export const READLAB_TAG_COLORS: Record<ReadLabTag, string> = {
  reading: "ghost-tag bg-blue-500/10 text-blue-600 dark:bg-blue-700 dark:text-white/90",
  read: "ghost-tag bg-emerald-500/10 text-emerald-600 dark:bg-emerald-700 dark:text-white/90",
  pending: "ghost-tag bg-amber-500/10 text-amber-600 dark:bg-amber-700 dark:text-white/90",
}

export interface ReadLabHighlight {
  id: string
  text: string
  color: string
}

export interface ReadLabText {
  id: string
  title: string
  content: string
  sourceType: "paste" | "image" | "pdf"
  folderId: string | null
  tags: ReadLabTag[]
  highlights: ReadLabHighlight[]
  translationMap: Record<string, string>
  /** Per-occurrence translations produced by System B. */
  contextualTranslationMap?: Record<string, string>
  createdAt: number
}

export interface ReadLabFolder {
  id: string
  name: string
  createdAt: number
}
