import type { PartOfSpeech } from "@/lib/types"

export const partOfSpeechLabels: Record<PartOfSpeech, string> = {
  verb: "Verb",
  "phrasal-verb": "Phrasal verb",
  noun: "Noun",
  adjective: "Adjective",
  adverb: "Adverb",
  preposition: "Preposition",
  conjunction: "Conjunction",
  interjection: "Interjection",
  acronym: "Acronym",
  idiom: "Idiom",
}

export const partOfSpeechColors: Record<PartOfSpeech, string> = {
  verb: "ghost-tag bg-blue-500/10 text-blue-700 dark:bg-blue-700 dark:text-white/90",
  "phrasal-verb": "ghost-tag bg-sky-500/10 text-sky-700 dark:bg-sky-700 dark:text-white/90",
  noun: "ghost-tag bg-emerald-500/10 text-emerald-700 dark:bg-emerald-700 dark:text-white/90",
  adjective: "ghost-tag bg-amber-500/10 text-amber-700 dark:bg-amber-700 dark:text-white/90",
  adverb: "ghost-tag bg-purple-500/10 text-purple-700 dark:bg-purple-700 dark:text-white/90",
  preposition: "ghost-tag bg-rose-500/10 text-rose-700 dark:bg-rose-700 dark:text-white/90",
  conjunction: "ghost-tag bg-cyan-500/10 text-cyan-700 dark:bg-cyan-800 dark:text-white/90",
  interjection: "ghost-tag bg-orange-500/10 text-orange-700 dark:bg-orange-700 dark:text-white/90",
  acronym: "ghost-tag bg-indigo-500/10 text-indigo-700 dark:bg-indigo-700 dark:text-white/90",
  idiom: "ghost-tag bg-pink-500/10 text-pink-700 dark:bg-pink-700 dark:text-white/90",
}

export const partOfSpeechWritingColors: Record<PartOfSpeech, string> = {
  verb: "bg-blue-500/10 text-blue-600 dark:bg-blue-700 dark:text-white/90",
  "phrasal-verb": "bg-sky-500/10 text-sky-600 dark:bg-sky-700 dark:text-white/90",
  noun: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-700 dark:text-white/90",
  adjective: "bg-amber-500/10 text-amber-600 dark:bg-amber-700 dark:text-white/90",
  adverb: "bg-purple-500/10 text-purple-600 dark:bg-purple-700 dark:text-white/90",
  preposition: "bg-rose-500/10 text-rose-600 dark:bg-rose-700 dark:text-white/90",
  conjunction: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-800 dark:text-white/90",
  interjection: "bg-orange-500/10 text-orange-600 dark:bg-orange-700 dark:text-white/90",
  acronym: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-700 dark:text-white/90",
  idiom: "bg-pink-500/10 text-pink-600 dark:bg-pink-700 dark:text-white/90",
}

export const partOfSpeechStudyColors: Record<PartOfSpeech, string> = {
  verb: "ghost-tag bg-blue-500/10 text-blue-700 dark:bg-blue-700 dark:text-white/90",
  "phrasal-verb": "ghost-tag bg-sky-500/10 text-sky-700 dark:bg-sky-700 dark:text-white/90",
  noun: "ghost-tag bg-emerald-500/10 text-emerald-700 dark:bg-emerald-700 dark:text-white/90",
  adjective: "ghost-tag bg-amber-500/10 text-amber-700 dark:bg-amber-700 dark:text-white/90",
  adverb: "ghost-tag bg-purple-500/10 text-purple-700 dark:bg-purple-700 dark:text-white/90",
  preposition: "ghost-tag bg-rose-500/10 text-rose-700 dark:bg-rose-700 dark:text-white/90",
  conjunction: "ghost-tag bg-cyan-500/10 text-cyan-700 dark:bg-cyan-800 dark:text-white/90",
  interjection: "ghost-tag bg-orange-500/10 text-orange-700 dark:bg-orange-700 dark:text-white/90",
  acronym: "ghost-tag bg-indigo-500/10 text-indigo-700 dark:bg-indigo-700 dark:text-white/90",
  idiom: "ghost-tag bg-pink-500/10 text-pink-700 dark:bg-pink-700 dark:text-white/90",
}

export const FLASHCARDS_UPDATED_EVENT = "vocablab-flashcards-updated"
export const AI_PREFERENCES_UPDATED_EVENT = "vocablab-ai-preferences-updated"
export const PROGRESS_UPDATED_EVENT = "vocablab-progress-updated"
export const READLAB_TEXTS_UPDATED_EVENT = "readlab-texts-updated"
export const REGENCYLAB_CARDS_UPDATED_EVENT = "regencylab-cards-updated"
export const RULELAB_CARDS_UPDATED_EVENT = "rulelab-cards-updated"
export const REGENCYLAB_PREFERENCES_UPDATED_EVENT = "regencylab-preferences-updated"
export const QUESTIONLAB_DATA_UPDATED_EVENT = "questionlab-data-updated"
export const REVIEW_MISTAKE_THRESHOLD_UPDATED_EVENT =
  "vocablab-review-mistake-threshold-updated"
