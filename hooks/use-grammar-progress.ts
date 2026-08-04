"use client"

import { useState, useEffect, useCallback } from "react"
import { FLASHCARDS_UPDATED_EVENT, PROGRESS_UPDATED_EVENT, REGENCYLAB_CARDS_UPDATED_EVENT, RULELAB_CARDS_UPDATED_EVENT } from "@/lib/constants"

export interface GrammarSession {
  id: string
  date: number
  totalExercises: number
  correctAnswers: number
  exerciseType: "fill-blank" | "verb-conjugation" | "mixed"
  wordsUsed: string[]
}

export type StudyLab = "vocab" | "regency" | "rule"
export type StudyMode = "flip" | "multiple-choice" | "active-recall" | "writing"

export interface StudySession {
  id: string
  date: number
  folderName: string
  totalCards: number
  correctFirstTry: number
  wordsToReview: string[]
  /** Number of distinct cards that received at least one Again. */
  mistakeCards?: number
  /** Total Again presses during the session. */
  totalMistakes?: number
  /** Lab that produced the session. Older records default to VocabLab. */
  lab?: StudyLab
  /** Study surface used for the session. */
  mode?: StudyMode
  /** Stable card IDs seen in the session, when available. */
  cardIds?: string[]
  /** Stable folder ID for folder-scoped progress; older sessions use folderName. */
  folderId?: string | null
  /** Elapsed seconds when the study timer was enabled. */
  durationSeconds?: number
}

export type StudyStatsFilter = {
  lab?: StudyLab
  folderName?: string
  folderId?: string | null
}

const GRAMMAR_PROGRESS_KEY = "vocablab-grammar-progress"
const STUDY_PROGRESS_KEY = "vocablab-study-progress"
const DISMISSED_REVIEW_WORDS_KEY = "vocablab-dismissed-review-words"

function notifyProgressUpdated() {
  if (typeof window === "undefined") return
  window.setTimeout(() => {
    window.dispatchEvent(new Event(PROGRESS_UPDATED_EVENT))
  }, 0)
}

const STUDY_CARD_STORES = [
  { database: "vocab-lab-db", store: "flashcards", event: FLASHCARDS_UPDATED_EVENT },
  { database: "regencylab-db", store: "cards", event: REGENCYLAB_CARDS_UPDATED_EVENT },
  { database: "rulelab-db", store: "cards", event: RULELAB_CARDS_UPDATED_EVENT },
] as const

function resetStudyStreaks(database: string, storeName: string) {
  if (typeof indexedDB === "undefined") return Promise.resolve()
  return new Promise<void>((resolve) => {
    const request = indexedDB.open(database)
    request.onerror = () => resolve()
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.close()
        resolve()
        return
      }
      const transaction = db.transaction(storeName, "readwrite")
      const store = transaction.objectStore(storeName)
      const read = store.getAll()
      read.onsuccess = () => {
        const now = Date.now()
        for (const value of read.result) {
          if (!value || typeof value !== "object") continue
          const record = value as Record<string, unknown>
          if (record.studyStreak === undefined || record.studyStreak === 0) continue
          store.put({ ...record, studyStreak: 0, updatedAt: now })
        }
      }
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onerror = () => { db.close(); resolve() }
      transaction.onabort = () => { db.close(); resolve() }
    }
  })
}

export function useGrammarProgress() {
  const [grammarSessions, setGrammarSessions] = useState<GrammarSession[]>([])
  const [studySessions, setStudySessions] = useState<StudySession[]>([])
  const [dismissedReviewWords, setDismissedReviewWords] = useState<string[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const loadAll = () => {
        try {
          const grammarData = localStorage.getItem(GRAMMAR_PROGRESS_KEY)
          if (grammarData) setGrammarSessions(JSON.parse(grammarData))
          else setGrammarSessions([])

          const studyData = localStorage.getItem(STUDY_PROGRESS_KEY)
          if (studyData) setStudySessions(JSON.parse(studyData))
          else setStudySessions([])

          const dismissedData = localStorage.getItem(DISMISSED_REVIEW_WORDS_KEY)
          if (dismissedData) setDismissedReviewWords(JSON.parse(dismissedData))
          else setDismissedReviewWords([])
        } catch (error) {
          console.error("Error loading progress:", error)
        }
      }

      loadAll()

      const onProgressUpdated = () => loadAll()
      window.addEventListener(PROGRESS_UPDATED_EVENT, onProgressUpdated)

      setIsLoaded(true)

      return () => {
        window.removeEventListener(PROGRESS_UPDATED_EVENT, onProgressUpdated)
      }
    }
  }, [])

  // Save grammar sessions
  const saveGrammarSession = useCallback((session: Omit<GrammarSession, "id" | "date">) => {
    const newSession: GrammarSession = {
      ...session,
      id: crypto.randomUUID(),
      date: Date.now(),
    }

    setGrammarSessions((prev) => {
      const updated = [newSession, ...prev].slice(0, 50) // Keep last 50 sessions
      localStorage.setItem(GRAMMAR_PROGRESS_KEY, JSON.stringify(updated))
      notifyProgressUpdated()
      return updated
    })

    return newSession
  }, [])

  // Save study sessions
  const saveStudySession = useCallback((session: Omit<StudySession, "id" | "date">) => {
    const newSession: StudySession = {
      ...session,
      id: crypto.randomUUID(),
      date: Date.now(),
    }

    setStudySessions((prev) => {
      const updated = [newSession, ...prev].slice(0, 50) // Keep last 50 sessions
      localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(updated))
      notifyProgressUpdated()
      return updated
    })

    return newSession
  }, [])

  const dismissReviewWord = useCallback((word: string) => {
    const normalized = word.trim().toLowerCase()
    if (!normalized) return

    setDismissedReviewWords((prev) => {
      if (prev.includes(normalized)) return prev
      const updated = [normalized, ...prev].slice(0, 500)
      localStorage.setItem(DISMISSED_REVIEW_WORDS_KEY, JSON.stringify(updated))
      notifyProgressUpdated()
      return updated
    })
  }, [])

  // Reset all statistics
  const resetStats = useCallback(async () => {
    setGrammarSessions([])
    setStudySessions([])
    setDismissedReviewWords([])
    localStorage.removeItem(GRAMMAR_PROGRESS_KEY)
    localStorage.removeItem(STUDY_PROGRESS_KEY)
    localStorage.removeItem(DISMISSED_REVIEW_WORDS_KEY)
    await Promise.all(STUDY_CARD_STORES.map((entry) => resetStudyStreaks(entry.database, entry.store)))
    for (const entry of STUDY_CARD_STORES) {
      window.setTimeout(() => window.dispatchEvent(new Event(entry.event)), 0)
    }
    notifyProgressUpdated()
  }, [])

  // Get statistics
  const getGrammarStats = useCallback(() => {
    if (grammarSessions.length === 0) {
      return {
        totalSessions: 0,
        totalExercises: 0,
        totalCorrect: 0,
        averageAccuracy: 0,
        lastSession: null,
      }
    }

    const totalExercises = grammarSessions.reduce((sum, s) => sum + s.totalExercises, 0)
    const totalCorrect = grammarSessions.reduce((sum, s) => sum + s.correctAnswers, 0)

    return {
      totalSessions: grammarSessions.length,
      totalExercises,
      totalCorrect,
      averageAccuracy: totalExercises > 0 ? Math.round((totalCorrect / totalExercises) * 100) : 0,
      lastSession: grammarSessions[0] || null,
    }
  }, [grammarSessions])

  const getStudyStats = useCallback((filter: StudyStatsFilter = {}) => {
    const scopedSessions = studySessions.filter((session) => {
      if (filter.lab !== undefined && (session.lab ?? "vocab") !== filter.lab) return false
      if (filter.folderId !== undefined && session.folderId !== undefined) return session.folderId === filter.folderId
      return filter.folderName === undefined || session.folderName === filter.folderName
    })
    if (scopedSessions.length === 0) {
      return {
        totalSessions: 0,
        totalCards: 0,
        totalCorrectFirstTry: 0,
        averageAccuracy: 0,
        lastSession: null,
        wordsToReview: [],
        totalMistakes: 0,
        mistakeCards: 0,
        uniqueCardsStudied: 0,
        bestAccuracy: 0,
        averageSessionCards: 0,
        totalStudyMinutes: 0,
        daysStudied: 0,
        sessionsLast7Days: 0,
        labBreakdown: { vocab: 0, regency: 0, rule: 0 },
        modeBreakdown: { flip: 0, "multiple-choice": 0, "active-recall": 0, writing: 0 },
      }
    }

    const totalCards = scopedSessions.reduce((sum, s) => sum + s.totalCards, 0)
    const totalCorrectFirstTry = scopedSessions.reduce((sum, s) => sum + s.correctFirstTry, 0)
    const totalMistakes = scopedSessions.reduce(
      (sum, session) => sum + (session.totalMistakes ?? Math.max(0, session.totalCards - session.correctFirstTry)),
      0,
    )
    const mistakeCards = scopedSessions.reduce(
      (sum, session) => sum + (session.mistakeCards ?? (session.totalCards > session.correctFirstTry ? 1 : 0)),
      0,
    )
    const uniqueCardIds = new Set(scopedSessions.flatMap((session) => session.cardIds ?? []))
    const sessionsWithoutCardIds = scopedSessions.filter((session) => !session.cardIds?.length)
    const accuracyValues = scopedSessions.map((session) => session.totalCards > 0
      ? Math.round((session.correctFirstTry / session.totalCards) * 100)
      : 0)
    const labBreakdown: Record<StudyLab, number> = { vocab: 0, regency: 0, rule: 0 }
    const modeBreakdown: Record<StudyMode, number> = { flip: 0, "multiple-choice": 0, "active-recall": 0, writing: 0 }
    for (const session of scopedSessions) {
      labBreakdown[session.lab ?? "vocab"] += 1
      if (session.mode) modeBreakdown[session.mode] += 1
    }
    const today = Date.now()
    const sevenDaysAgo = today - 7 * 24 * 60 * 60 * 1000
    const daysStudied = new Set(scopedSessions.map((session) => new Date(session.date).toISOString().slice(0, 10)))

    // Get unique words that need review from last 5 sessions
    const recentWords = scopedSessions
      .slice(0, 5)
      .flatMap((s) => s.wordsToReview)
    const wordsToReview = [...new Set(recentWords)].filter(
      (w) => !dismissedReviewWords.includes(String(w).toLowerCase())
    )

    return {
      totalSessions: scopedSessions.length,
      totalCards,
      totalCorrectFirstTry,
      averageAccuracy: totalCards > 0 ? Math.round((totalCorrectFirstTry / totalCards) * 100) : 0,
      lastSession: scopedSessions[0] || null,
      wordsToReview,
      totalMistakes,
      mistakeCards,
      uniqueCardsStudied: uniqueCardIds.size + sessionsWithoutCardIds.reduce((sum, session) => sum + session.totalCards, 0),
      bestAccuracy: Math.max(...accuracyValues),
      averageSessionCards: scopedSessions.length > 0 ? Math.round(totalCards / scopedSessions.length) : 0,
      totalStudyMinutes: Math.round(scopedSessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0) / 60),
      daysStudied: daysStudied.size,
      sessionsLast7Days: scopedSessions.filter((session) => session.date >= sevenDaysAgo).length,
      labBreakdown,
      modeBreakdown,
    }
  }, [studySessions, dismissedReviewWords])

  // Clear all progress
  const clearProgress = useCallback(() => {
    localStorage.removeItem(GRAMMAR_PROGRESS_KEY)
    localStorage.removeItem(STUDY_PROGRESS_KEY)
    localStorage.removeItem(DISMISSED_REVIEW_WORDS_KEY)
    setGrammarSessions([])
    setStudySessions([])
    setDismissedReviewWords([])
    notifyProgressUpdated()
  }, [])

  return {
    grammarSessions,
    studySessions,
    isLoaded,
    saveGrammarSession,
    saveStudySession,
    resetStats,
    getGrammarStats,
    getStudyStats,
    dismissReviewWord,
    clearProgress,
  }
}
