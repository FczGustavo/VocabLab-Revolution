"use client"

import { useState, useEffect, useCallback } from "react"
import { PROGRESS_UPDATED_EVENT } from "@/lib/constants"

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
  /** Elapsed seconds when the study timer was enabled. */
  durationSeconds?: number
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
  const resetStats = useCallback(() => {
    setGrammarSessions([])
    setStudySessions([])
    setDismissedReviewWords([])
    localStorage.removeItem(GRAMMAR_PROGRESS_KEY)
    localStorage.removeItem(STUDY_PROGRESS_KEY)
    localStorage.removeItem(DISMISSED_REVIEW_WORDS_KEY)
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

  const getStudyStats = useCallback(() => {
    if (studySessions.length === 0) {
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

    const totalCards = studySessions.reduce((sum, s) => sum + s.totalCards, 0)
    const totalCorrectFirstTry = studySessions.reduce((sum, s) => sum + s.correctFirstTry, 0)
    const totalMistakes = studySessions.reduce(
      (sum, session) => sum + (session.totalMistakes ?? Math.max(0, session.totalCards - session.correctFirstTry)),
      0,
    )
    const mistakeCards = studySessions.reduce(
      (sum, session) => sum + (session.mistakeCards ?? (session.totalCards > session.correctFirstTry ? 1 : 0)),
      0,
    )
    const uniqueCardIds = new Set(studySessions.flatMap((session) => session.cardIds ?? []))
    const sessionsWithoutCardIds = studySessions.filter((session) => !session.cardIds?.length)
    const accuracyValues = studySessions.map((session) => session.totalCards > 0
      ? Math.round((session.correctFirstTry / session.totalCards) * 100)
      : 0)
    const labBreakdown: Record<StudyLab, number> = { vocab: 0, regency: 0, rule: 0 }
    const modeBreakdown: Record<StudyMode, number> = { flip: 0, "multiple-choice": 0, "active-recall": 0, writing: 0 }
    for (const session of studySessions) {
      labBreakdown[session.lab ?? "vocab"] += 1
      if (session.mode) modeBreakdown[session.mode] += 1
    }
    const today = Date.now()
    const sevenDaysAgo = today - 7 * 24 * 60 * 60 * 1000
    const daysStudied = new Set(studySessions.map((session) => new Date(session.date).toISOString().slice(0, 10)))

    // Get unique words that need review from last 5 sessions
    const recentWords = studySessions
      .slice(0, 5)
      .flatMap((s) => s.wordsToReview)
    const wordsToReview = [...new Set(recentWords)].filter(
      (w) => !dismissedReviewWords.includes(String(w).toLowerCase())
    )

    return {
      totalSessions: studySessions.length,
      totalCards,
      totalCorrectFirstTry,
      averageAccuracy: totalCards > 0 ? Math.round((totalCorrectFirstTry / totalCards) * 100) : 0,
      lastSession: studySessions[0] || null,
      wordsToReview,
      totalMistakes,
      mistakeCards,
      uniqueCardsStudied: uniqueCardIds.size + sessionsWithoutCardIds.reduce((sum, session) => sum + session.totalCards, 0),
      bestAccuracy: Math.max(...accuracyValues),
      averageSessionCards: studySessions.length > 0 ? Math.round(totalCards / studySessions.length) : 0,
      totalStudyMinutes: Math.round(studySessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0) / 60),
      daysStudied: daysStudied.size,
      sessionsLast7Days: studySessions.filter((session) => session.date >= sevenDaysAgo).length,
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
