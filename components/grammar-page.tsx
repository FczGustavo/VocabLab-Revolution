"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trophy,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  BookOpen,
  FolderPlus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useFlashcardsDB } from "@/hooks/use-flashcards-db"
import { useGrammarDB } from "@/hooks/use-grammar-db"
import { cn } from "@/lib/utils"
import { TOPICS } from "@/lib/grammar-topics"
import type { GrammarQuestion, GrammarFolder, GrammarList, GrammarQuestionOption } from "@/lib/types"
import { FolderCard, NewFolderCard } from "@/components/folder-card"
import { FolderDeleteChoice, FolderDeleteOptions } from "@/components/folder-delete-dialog"
import { LongPressButton } from "@/components/long-press-button"

// ── Topic taxonomy ─────────────────────────────────────────────────────────────



// ── Local types ───────────────────────────────────────────────────────────────

type Phase = "idle" | "loading" | "quiz" | "complete"

const QUESTION_LAB_TEMPORARILY_DISABLED = true

interface QuestionState {
  pendingLetter: string | null
  answeredLetter: string | null
  eliminated: string[]
}

export function GrammarPage() {
  const { model } = useGptModel()
  const { allFlashcards } = useFlashcardsDB()
  const {
    getQuestionsForTopics,
    saveQuestion,
    getAnsweredIds,
    markAnswered,
    getFolders,
    createFolder,
    deleteFolder,
    renameFolder,
    getLists,
    saveList,
    deleteList,
    getQuestionsById,
  } = useGrammarDB()

  const [selectedTopics, setSelectedTopics] = useState<string[]>(["verb-forms"])
  const [selectedSubtopics, setSelectedSubtopics] = useState<Record<string, string[]>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [questionCount, setQuestionCount] = useState<5 | 10 | 15>(5)

  const [folders, setFolders] = useState<GrammarFolder[]>([])
  const [lists, setLists] = useState<GrammarList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null)
  const [generalFolderName, setGeneralFolderName] = useState("General")
  const [folderColors, setFolderColors] = useState<Record<string, string>>({})

  const [isSaveOpen, setIsSaveOpen] = useState(false)
  const [saveListName, setSaveListName] = useState("")
  const [saveFolderId, setSaveFolderId] = useState<string | null>(null)

  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [deleteTargetFolderId, setDeleteTargetFolderId] = useState<string | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  const [phase, setPhase] = useState<Phase>("idle")
  const [questions, setQuestions] = useState<GrammarQuestion[]>([])
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([])
  const [loadingProgress, setLoadingProgress] = useState({ done: 0, total: 0 })
  const [loadingStatus, setLoadingStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const lastClickRef = useRef<Record<string, number>>({})

  useEffect(() => {
    getFolders().then(setFolders).catch(console.error)
    getLists().then(setLists).catch(console.error)
  }, [getFolders, getLists])

  useEffect(() => {
    const savedName = localStorage.getItem("grammarlab_general_folder_name")
    const savedColors = localStorage.getItem("grammarlab_folder_colors")
    if (savedName) setGeneralFolderName(savedName)
    if (savedColors) {
      try {
        setFolderColors(JSON.parse(savedColors))
      } catch {
        localStorage.removeItem("grammarlab_folder_colors")
      }
    }
  }, [])

  const toggleTopic = useCallback((id: string) => {
    setSelectedTopics((prev) =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter((t) => t !== id) : prev
        : [...prev, id]
    )
  }, [])

  const toggleSubtopic = useCallback((topicId: string, sub: string) => {
    setSelectedSubtopics((prev) => {
      const curr = prev[topicId] ?? []
      return {
        ...prev,
        [topicId]: curr.includes(sub) ? curr.filter((s) => s !== sub) : [...curr, sub],
      }
    })
  }, [])

  const handleLoadList = useCallback(
    async (list: GrammarList) => {
      setActiveListId(list.id)
      setPhase("loading")
      setLoadingStatus("Loading saved questions...")
      setLoadingProgress({ done: 0, total: 0 })
      setError(null)
      setQuestionStates([])
      lastClickRef.current = {}
      try {
        const loaded = await getQuestionsById(list.questionIds)
        if (!loaded.length) {
          setError("This list is empty or its questions are no longer available.")
          setPhase("idle")
          return
        }
        setQuestions(loaded)
        setQuestionStates(loaded.map(() => ({ pendingLetter: null, answeredLetter: null, eliminated: [] })))
        setPhase("quiz")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this list.")
        setPhase("idle")
      }
    },
    [getQuestionsById]
  )

  const handleSaveList = useCallback(async () => {
    if (!saveListName.trim() || !questions.length) return
    const list: GrammarList = {
      id: crypto.randomUUID(),
      name: saveListName.trim(),
      folderId: saveFolderId,
      questionIds: questions.map((q) => q.id),
      createdAt: Date.now(),
    }
    await saveList(list)
    setLists((prev) => [...prev, list])
    setActiveListId(list.id)
    setIsSaveOpen(false)
    setSaveListName("")
  }, [saveListName, saveFolderId, questions, saveList])

  const handleCreateFolderInSave = useCallback(async () => {
    if (!newFolderName.trim()) return
    const folder = await createFolder(newFolderName.trim())
    setFolders((prev) => [...prev, folder])
    setSaveFolderId(folder.id)
    setNewFolderName("")
  }, [newFolderName, createFolder])

  const handleCreateFolderFromBar = useCallback(async () => {
    if (!newFolderName.trim()) return
    const folder = await createFolder(newFolderName.trim())
    setFolders((prev) => [...prev, folder])
    setExpandedFolderId(folder.id)
    setNewFolderName("")
    setIsFolderDialogOpen(false)
  }, [newFolderName, createFolder])

  const getFolderGradient = (folderId: string, index: number): "default" | "violet" | "emerald" | "amber" | "rose" => {
    const color = folderColors[folderId]
    if (color) return color as "default" | "violet" | "emerald" | "amber" | "rose"
    const defaults: Array<"default" | "violet" | "emerald" | "amber"> = ["default", "violet", "emerald", "amber"]
    return defaults[index % defaults.length]
  }

  const updateFolderColor = (folderId: string, color: string) => {
    const next = { ...folderColors, [folderId]: color }
    setFolderColors(next)
    localStorage.setItem("grammarlab_folder_colors", JSON.stringify(next))
  }

  const openFolderManager = (folder: GrammarFolder | null) => {
    setEditingFolderId(folder?.id ?? null)
    setEditingFolderName(folder?.name ?? generalFolderName)
    setDeleteTargetFolderId(null)
    setIsFolderManagerOpen(true)
  }

  const handleRenameFolder = async () => {
    const name = editingFolderName.trim()
    if (!name) return
    if (editingFolderId === null) {
      localStorage.setItem("grammarlab_general_folder_name", name)
      setGeneralFolderName(name)
      return
    }
    const renamed = await renameFolder(editingFolderId, name)
    setFolders((prev) => prev.map((folder) => folder.id === renamed.id ? renamed : folder))
  }

  const transferLists = async (sourceFolderId: string | null, targetFolderId: string | null, deleteSource = false) => {
    const sourceLists = lists.filter((list) => list.folderId === sourceFolderId)
    const moved = sourceLists.map((list) => ({ ...list, folderId: targetFolderId }))
    await Promise.all(moved.map((list) => saveList(list)))
    setLists((prev) => prev.map((list) => moved.find((item) => item.id === list.id) ?? list))

    if (deleteSource && sourceFolderId !== null) {
      await deleteFolder(sourceFolderId)
      setFolders((prev) => prev.filter((folder) => folder.id !== sourceFolderId))
      if (expandedFolderId === sourceFolderId) setExpandedFolderId(targetFolderId)
    }
  }

  const handleTransferLists = async (targetFolderId: string | null) => {
    await transferLists(editingFolderId, targetFolderId)
    setIsFolderManagerOpen(false)
  }

  const handleDeleteFolderWithMigration = async () => {
    if (editingFolderId === null) {
      const generalLists = lists.filter((list) => !list.folderId)
      await Promise.all(generalLists.map((list) => deleteList(list.id)))
      setLists((prev) => prev.filter((list) => list.folderId))
      setActiveListId((current) => generalLists.some((list) => list.id === current) ? null : current)
      setIsDeleteConfirmOpen(false)
      setIsFolderManagerOpen(false)
      return
    }
    await transferLists(editingFolderId, deleteTargetFolderId, true)
    setIsDeleteConfirmOpen(false)
    setIsFolderManagerOpen(false)
  }

  const handleDeleteList = useCallback(
    async (listId: string) => {
      await deleteList(listId)
      setLists((prev) => prev.filter((l) => l.id !== listId))
      if (activeListId === listId) setActiveListId(null)
    },
    [deleteList, activeListId]
  )

  const handleGenerate = useCallback(async () => {
    if (!selectedTopics.length) return
    setPhase("loading")
    setLoadingStatus("Preparing your practice session...")
    setLoadingProgress({ done: 0, total: questionCount })
    setError(null)
    setActiveListId(null)
    lastClickRef.current = {}

    const allUserWords = Array.from(
      new Set(
        allFlashcards
          .map((f) => f.word?.trim())
          .filter((w): w is string => Boolean(w))
      )
    )
    const generated: GrammarQuestion[] = []
    const newlyGenerated: GrammarQuestion[] = []

    try {
      const answeredIds = await getAnsweredIds()
      const maxFromCache = 0

      // 1. Try shared Supabase cache first
      let fromDB: GrammarQuestion[] = []
      try {
        const res = await fetch("/api/grammar/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topics: selectedTopics,
            subtopics: selectedSubtopics,
            excludeIds: answeredIds,
            limit: questionCount * 8,
          }),
        })
        if (res.ok) {
          const json = await res.json()
          const all: GrammarQuestion[] = json.questions ?? []
          // Prefer high-quality cached items and force mostly fresh AI generation.
          const qualityFiltered = all.filter((q) => {
            const stem = (q.questionText ?? "").toLowerCase()
            const ctx = (q.contextPassage ?? "").toLowerCase()
            const hasWeakStem =
              stem.includes("standard order") ||
              stem.includes("order of adjectives") ||
              stem.includes("adverb placement") ||
              stem.includes("according to grammar rules") ||
              stem.includes("following the standard")
            const hasWeakContext =
              ctx.includes("order of adjectives") ||
              ctx.includes("adverb placement") ||
              ctx.includes("opinion >") ||
              ctx.includes("size > age")
            return !hasWeakStem && !hasWeakContext
          })
          // Shuffle so different users get variety.
          fromDB = qualityFiltered.sort(() => Math.random() - 0.5).slice(0, maxFromCache)
        }
      } catch {
        // Supabase unavailable – fall back to local IndexedDB
        const cached = await getQuestionsForTopics(selectedTopics, answeredIds)
        fromDB = cached.slice(0, maxFromCache)
      }

      // Use DB questions
      for (const q of fromDB) {
        generated.push(q)
        await saveQuestion(q) // keep local copy in IndexedDB
        setLoadingProgress({ done: generated.length, total: questionCount })
      }

      // 2. Generate remainder with AI
      const needMore = questionCount - fromDB.length

      // Build a flat pool of all selected subtopics across all selected topics
      const subPool: { topicId: string; topicLabel: string; subtopic: string }[] = []
      for (const topicId of selectedTopics) {
        const topic = TOPICS.find((t) => t.id === topicId)!
        const activeSubs = selectedSubtopics[topicId] ?? []
        const subs = activeSubs.length > 0 ? activeSubs : topic.subtopics
        for (const sub of subs) {
          subPool.push({ topicId, topicLabel: topic.label, subtopic: sub })
        }
      }
      // Blend 2-3 subtopics for broader variation (or 1 if pool has only 1)
      const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
      const blendSize = subPool.length >= 2 ? 2 : 1

      for (let i = 0; i < needMore; i++) {
        const qNum = fromDB.length + i + 1
        setLoadingStatus(`Creating question ${qNum} of ${questionCount}...`)

        const dynamicBlendSize = subPool.length >= 3 ? randomInt(2, 3) : blendSize
        // Pick random distinct subtopics from the pool (less repetitive than cycling).
        const shuffledPool = [...subPool].sort(() => Math.random() - 0.5)
        const blend = shuffledPool.slice(0, dynamicBlendSize)
        // Deduplicate by topic+subtopic key
        const seen = new Set<string>()
        const uniqueBlend = blend.filter((b) => {
          const key = `${b.topicId}:${b.subtopic}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        const primaryEntry = uniqueBlend[0]
        // Use the primary entry's topic label (most representative)
        const topicLabel = primaryEntry.topicLabel
        const subtopics = uniqueBlend.map((b) => b.subtopic)
        const qType: "correct" | "incorrect" = Math.random() < 0.5 ? "correct" : "incorrect"

        // Use learner words sparingly to avoid forcing unnatural repeated contexts.
        const sampledUserWords =
          allUserWords.length > 0 && Math.random() < 0.35
            ? [...allUserWords].sort(() => Math.random() - 0.5).slice(0, 3)
            : undefined

        // Tell backend what was just generated so it can avoid repeating context/stems.
        const recentContexts = generated
          .slice(-5)
          .map((q) => [q.contextPassage, q.questionText].filter(Boolean).join(" ").trim())
          .filter((value) => value.length > 0)

        const aiRes = await fetch("/api/ai/grammar-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicLabel,
            subtopics,
            questionType: qType,
            userWords: sampledUserWords,
            recentContexts,
          }),
        })
        if (!aiRes.ok) {
          const json = await aiRes.json().catch(() => ({}))
          throw new Error(json?.error || "Could not generate the question.")
        }
        const aiResult: { questionText: string; contextPassage?: string | null; options: GrammarQuestionOption[] } = await aiRes.json()

        const question: GrammarQuestion = {
          id: crypto.randomUUID(),
          topic: primaryEntry.topicId,
          subtopic: primaryEntry.subtopic,
          questionText: aiResult.questionText,
          contextPassage: aiResult.contextPassage ?? undefined,
          questionType: qType,
          options: aiResult.options,
          createdAt: Date.now(),
        }

        await saveQuestion(question) // IndexedDB local
        newlyGenerated.push(question)
        generated.push(question)
        setLoadingProgress({ done: generated.length, total: questionCount })
      }

      // 3. Push new questions to shared Supabase cache
      if (newlyGenerated.length > 0) {
        setLoadingStatus("Saving your questions...")
        try {
          await fetch("/api/grammar/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questions: newlyGenerated }),
          })
        } catch (saveErr) {
          console.error("[grammar] falha ao salvar no banco:", saveErr)
        }
      }

      if (generated.length === 0) {
        setError("No questions were generated. Check your AI configuration and try again.")
        setPhase("idle")
        return
      }

      setQuestions(generated)
      setQuestionStates(generated.map(() => ({ pendingLetter: null, answeredLetter: null, eliminated: [] })))
      setPhase("quiz")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the questions.")
      setPhase("idle")
    }
  }, [selectedTopics, selectedSubtopics, questionCount, model, allFlashcards, getAnsweredIds, getQuestionsForTopics, saveQuestion])

  const handleEliminate = useCallback((qIdx: number, letter: string) => {
    setQuestionStates((prev) => {
      const next = [...prev]
      const qs = next[qIdx]
      if (!qs || qs.answeredLetter) return prev
      const already = qs.eliminated.includes(letter)
      next[qIdx] = {
        ...qs,
        eliminated: already ? qs.eliminated.filter((l) => l !== letter) : [...qs.eliminated, letter],
        pendingLetter: qs.pendingLetter === letter ? null : qs.pendingLetter,
      }
      return next
    })
  }, [])

  const handleOptionClick = useCallback(
    (qIdx: number, letter: string) => {
      const qs = questionStates[qIdx]
      if (!qs || qs.answeredLetter) return
      const key = `${qIdx}-${letter}`
      const now = Date.now()
      const last = lastClickRef.current[key] ?? 0
      lastClickRef.current[key] = now
      if (now - last < 400) {
        handleEliminate(qIdx, letter)
      } else {
        setQuestionStates((prev) => {
          const next = [...prev]
          next[qIdx] = {
            ...next[qIdx],
            pendingLetter: next[qIdx].pendingLetter === letter ? null : letter,
          }
          return next
        })
      }
    },
    [questionStates, handleEliminate]
  )

  const handleConfirm = useCallback(
    async (qIdx: number) => {
      const qs = questionStates[qIdx]
      if (!qs || !qs.pendingLetter || qs.answeredLetter) return
      const question = questions[qIdx]
      const letter = qs.pendingLetter
      const correct = question.options.find((o) => o.letter === letter)?.isAnswer === true
      setQuestionStates((prev) => {
        const next = [...prev]
        next[qIdx] = { ...next[qIdx], answeredLetter: letter }
        return next
      })
      await markAnswered({ questionId: question.id, chosenLetter: letter, correct, answeredAt: Date.now() })
    },
    [questionStates, questions, markAnswered]
  )

  const handleNewSession = useCallback(() => {
    setPhase("idle")
    setQuestions([])
    setQuestionStates([])
    lastClickRef.current = {}
    setError(null)
    setActiveListId(null)
    setExpandedFolderId(null)
    setLoadingStatus("")
  }, [])

  if (QUESTION_LAB_TEMPORARILY_DISABLED) {
    return (
      <div className="w-full">
        <div className="mb-20 flex flex-col items-center gap-6 pt-4 sm:mb-16 sm:pt-6">
          <h1 className="lab-title select-none font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">
            QuestionLab
          </h1>
        </div>
        <div className="flex justify-center px-4 text-center">
          <div className="mt-8 flex items-center gap-2 rounded-full border border-border/40 bg-card/70 px-4 py-2.5 text-sm text-muted-foreground shadow-sm">
            <AlertCircle className="size-4 shrink-0" />
            <span>QuestionLab is temporarily unavailable.</span>
          </div>
        </div>
      </div>
    )
  }

  const allAnswered = questionStates.length > 0 && questionStates.every((qs) => qs.answeredLetter !== null)
  const correctCount = questionStates.filter((qs, i) => {
    if (!qs.answeredLetter) return false
    return questions[i]?.options.find((o) => o.letter === qs.answeredLetter)?.isAnswer === true
  }).length

  // loading
  if (phase === "loading") {
    const { done, total } = loadingProgress
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-3 text-center sm:px-0">
        <Loader2 className="size-8 animate-spin text-primary/60" />
        <p className="text-[14px] font-medium text-foreground/70">{loadingStatus}</p>
        {total > 0 && (
          <div className="w-full max-w-xs">
            <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{done} of {total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // complete
  if (phase === "complete") {
    const total = questions.length
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-3 text-center sm:px-0">
        <Trophy className="size-16 text-amber-400" />
        <div className="text-center">
          <p className="text-[42px] font-light leading-none tracking-tight">{correctCount}/{total}</p>
          <p className="mt-1 text-[14px] text-muted-foreground">{pct}% correct</p>
        </div>
        <Button variant="outline" onClick={handleNewSession} className="gap-2">
          <RotateCcw className="size-4" />
          New session
        </Button>
      </div>
    )
  }

  // quiz
  if (phase === "quiz") {
    return (
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleNewSession} className="gap-2 text-muted-foreground">
            <RotateCcw className="size-3.5" />
            New session
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSaveListName(""); setSaveFolderId(null); setIsSaveOpen(true) }} className="gap-2">
            <BookmarkPlus className="size-4" />
            Save list
          </Button>
        </div>

        <p className="mb-5 text-center text-[11px] text-muted-foreground/60">
          Click once to select &middot; double-click to eliminate
        </p>

        <div className="flex flex-col gap-6">
          {questions.map((question, qIdx) => {
            const qs = questionStates[qIdx]
            if (!qs) return null
            const answered = qs.answeredLetter !== null
            return (
              <div key={question.id} className="rounded-2xl border border-border/40 bg-card p-4 shadow-sm sm:p-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Question {String(qIdx + 1).padStart(2, "0")}
                </p>
                {question.contextPassage && (
                  <div className="context-bubble mb-4 rounded-xl border border-border/30 bg-muted/30 px-4 py-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Supporting context</p>
                    <p className="text-[13px] leading-relaxed text-foreground/80 italic">{question.contextPassage}</p>
                  </div>
                )}
                <p className="mb-5 text-[15px] leading-relaxed text-foreground">{question.questionText}</p>

                <div className="flex flex-col gap-2">
                  {(() => {
                    // Defensive: pick exactly the FIRST option with isAnswer===true as the correct one.
                    // Guards against AI hallucinations where multiple (or all) options have isAnswer:true.
                    const correctAnswerLetter =
                      question.options.find((o) => o.isAnswer === true)?.letter ?? null
                    return question.options.map((option) => {
                    const isChosen = qs.answeredLetter === option.letter
                    const isCorrectOption = option.letter === correctAnswerLetter
                    const isEliminated = qs.eliminated.includes(option.letter)
                    const isPending = !answered && qs.pendingLetter === option.letter

                    let styles = "border-border/40 bg-muted/20 text-foreground hover:border-border/60 hover:bg-muted/40"
                    if (answered) {
                      if (isCorrectOption) styles = "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 dark:border-emerald-500/30"
                      else if (isChosen) styles = "border-red-400/40 bg-red-500/10 text-red-800 dark:text-red-300 dark:border-red-400/30"
                      else styles = "border-border/20 bg-transparent text-muted-foreground/50"
                    } else if (isPending) {
                      styles = "border-primary/40 bg-primary/10 text-primary"
                    } else if (isEliminated) {
                      styles = "border-border/20 bg-transparent text-muted-foreground/30"
                    }

                    return (
                      <div key={option.letter} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => handleOptionClick(qIdx, option.letter)}
                          disabled={answered}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-[14px] leading-relaxed transition-all duration-150",
                            styles,
                            answered ? "cursor-default" : "cursor-pointer"
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                            answered && isCorrectOption ? "border-emerald-500 bg-emerald-500 text-white"
                              : answered && isChosen ? "border-red-400 bg-red-400 text-white"
                              : isPending ? "border-primary bg-primary/15 text-primary"
                              : "border-border/50 text-muted-foreground"
                          )}>
                            {option.letter}
                          </span>
                          <span className={cn("flex-1 transition-all", isEliminated && !answered && "line-through opacity-40")}>
                            {option.text}
                          </span>
                          {answered && isCorrectOption && <CheckCircle2 className="ml-auto mt-0.5 size-4 shrink-0 text-emerald-500" />}
                          {answered && isChosen && !isCorrectOption && <XCircle className="ml-auto mt-0.5 size-4 shrink-0 text-red-400" />}
                        </button>
                        {answered && (
                          <div className={cn(
                            "mt-1 rounded-b-xl px-4 py-2 text-[12px] leading-relaxed",
                            isCorrectOption ? "bg-emerald-500/5 text-emerald-800 dark:text-emerald-300/80"
                              : isChosen ? "bg-red-500/5 text-red-800 dark:text-red-300/80"
                              : "bg-muted/20 text-muted-foreground"
                          )}>
                            {option.explanation}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
                </div>

                {!answered && qs.pendingLetter && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => handleConfirm(qIdx)} className="gap-2">
                      Check answer
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {allAnswered && (
          <div className="mt-8 flex justify-center">
            <Button onClick={() => setPhase("complete")} className="gap-2" size="lg">
              <Trophy className="size-4" />
              View results
            </Button>
          </div>
        )}

        <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
          <DialogContent className="max-w-[92vw] sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Save list</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <Input placeholder="List name..." value={saveListName} onChange={(e) => setSaveListName(e.target.value)} autoFocus />
              <div>
                <p className="mb-2 text-[12px] text-muted-foreground">Folder (optional)</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setSaveFolderId(null)} className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", saveFolderId === null ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground")}>
                    No folder
                  </button>
                  {folders.map((f) => (
                    <button key={f.id} type="button" onClick={() => setSaveFolderId(f.id)} className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", saveFolderId === f.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground")}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Input placeholder="New folder..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolderInSave()} className="text-[13px]" />
                <Button variant="outline" size="sm" onClick={handleCreateFolderInSave} disabled={!newFolderName.trim()}>
                  <FolderPlus className="size-3.5" />
                </Button>
              </div>
              <Button onClick={handleSaveList} disabled={!saveListName.trim()}>Save list</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // idle
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <header className="mb-12 flex justify-center sm:mb-14">
        <h1 className="lab-title select-none text-center font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">
          QuestionLab
        </h1>
      </header>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <section className="mx-auto max-w-3xl rounded-2xl border border-border/40 bg-card/80 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {TOPICS.map((topic) => (
            <button key={topic.id} type="button" onClick={() => toggleTopic(topic.id)} className={cn("rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-150", selectedTopics.includes(topic.id) ? "border-primary/30 bg-primary/10 text-primary" : "border-border/30 bg-transparent text-muted-foreground hover:border-border/60 hover:text-foreground")}>
              {topic.label}
            </button>
          ))}
          <button type="button" onClick={() => setShowAdvanced((p) => !p)} className="ml-auto flex items-center gap-1 px-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {showAdvanced ? "Fewer options" : "More options"}
          </button>
        </div>

        {showAdvanced && selectedTopics.length > 0 && (
          <div className="mb-5 space-y-5 border-t border-border/30 pt-4">
            {TOPICS.filter((t) => selectedTopics.includes(t.id)).map((topic) => (
              <div key={topic.id}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{topic.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {topic.subtopics.map((sub) => {
                    const activeSubs = selectedSubtopics[topic.id] ?? []
                    const isActive = activeSubs.includes(sub)
                    return (
                      <button key={sub} type="button" onClick={() => toggleSubtopic(topic.id, sub)} className={cn("rounded-full border px-3 py-1 text-[11px] transition-all duration-150", isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-border/20 bg-transparent text-muted-foreground/70 hover:border-border/50 hover:text-muted-foreground")}>
                        {sub}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border/30 pt-4">
          <span className="shrink-0 text-[12px] text-muted-foreground">Questions:</span>
          <div className="flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5">
            {([5, 10, 15] as const).map((n) => (
              <button key={n} type="button" onClick={() => setQuestionCount(n)} className={cn("rounded-full px-3 py-1 text-[12px] font-medium transition-all", questionCount === n ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {n}
              </button>
            ))}
          </div>
          <div className="w-full sm:ml-auto sm:w-auto">
            <Button onClick={handleGenerate} disabled={!selectedTopics.length} className="w-full gap-2 sm:w-auto">
              <Sparkles className="size-4" />
              Generate {questionCount} questions
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <FolderCard
            name={generalFolderName}
            wordCount={lists.filter((list) => !list.folderId).length}
            subtitle={`${lists.filter((list) => !list.folderId).length} saved lists`}
            gradient={getFolderGradient("__general__", 0)}
            isSelected={expandedFolderId === "__general__"}
            onClick={() => setExpandedFolderId(expandedFolderId === "__general__" ? null : "__general__")}
            onSettings={() => openFolderManager(null)}
          />
          {folders.map((folder, index) => {
            const count = lists.filter((list) => list.folderId === folder.id).length
            return (
              <FolderCard
                key={folder.id}
                name={folder.name}
                wordCount={count}
                subtitle={`${count} saved ${count === 1 ? "list" : "lists"}`}
                gradient={getFolderGradient(folder.id, index + 1)}
                isSelected={expandedFolderId === folder.id}
                onClick={() => setExpandedFolderId(expandedFolderId === folder.id ? null : folder.id)}
                onSettings={() => openFolderManager(folder)}
              />
            )
          })}
          <NewFolderCard onClick={() => { setNewFolderName(""); setIsFolderDialogOpen(true) }} />
        </div>

        {expandedFolderId && (
          <div className="mt-4 rounded-2xl border border-border/40 bg-card/70 p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Saved lists</p>
            <div className="flex flex-wrap gap-2">
              {lists.filter((list) => expandedFolderId === "__general__" ? !list.folderId : list.folderId === expandedFolderId).length === 0 ? (
                <p className="text-[12px] text-muted-foreground/60">This folder is empty — save a list here.</p>
              ) : (
                lists.filter((list) => expandedFolderId === "__general__" ? !list.folderId : list.folderId === expandedFolderId).map((list) => (
                  <div key={list.id} className="flex items-center gap-1 rounded-full border border-border/30 bg-background px-1 py-1">
                    <button type="button" onClick={() => handleLoadList(list)} className={cn("rounded-full px-2 py-0.5 text-[12px] transition-colors", activeListId === list.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {list.name}
                    </button>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteList(list.id)} title="Delete list" className="size-6 text-muted-foreground/50 hover:text-destructive">
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Organize your saved question lists by topic or level.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-2">
            <Input placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolderFromBar()} autoFocus />
            <Button onClick={handleCreateFolderFromBar} disabled={!newFolderName.trim()}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isFolderManagerOpen} onOpenChange={setIsFolderManagerOpen}>
        <DialogContent className="min-h-[360px] max-w-[92vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Folder</DialogTitle>
            <DialogDescription>
              {editingFolderId === null
                ? `Manage the "${generalFolderName}" folder.`
                : `Manage folder "${editingFolderName}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Folder name</label>
              <div className="flex gap-2">
                <Input placeholder="Folder name" value={editingFolderName} onChange={(event) => setEditingFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleRenameFolder()} />
                <Button variant="outline" onClick={handleRenameFolder} disabled={!editingFolderName.trim()}>Rename</Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Folder color</label>
              <div className="flex gap-2">
                {[
                  { id: "default", label: "Blue", className: "bg-blue-400/50" },
                  { id: "violet", label: "Violet", className: "bg-violet-400/30" },
                  { id: "emerald", label: "Green", className: "bg-emerald-400/30" },
                  { id: "amber", label: "Yellow", className: "bg-amber-400/30" },
                  { id: "rose", label: "Rose", className: "bg-rose-400/30" },
                ].map((color) => {
                  const folderKey = editingFolderId ?? "__general__"
                  const isActive = (folderColors[folderKey] ?? "default") === color.id
                  return (
                    <button key={color.id} type="button" onClick={() => updateFolderColor(folderKey, color.id)} title={color.label} aria-label={`${color.label} folder color`} className={cn("size-8 rounded-full transition-all", color.className, isActive ? "ring-2 ring-offset-2 ring-foreground/30" : "hover:scale-110")} />
                  )
                })}
              </div>
            </div>

            <div className="space-y-3 border-t border-border/30 pt-2">
              <LongPressButton onLongPress={() => setIsDeleteConfirmOpen(true)} className="h-10 w-full rounded-md border border-destructive/20 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10">
                <Trash2 className="size-4 text-muted-foreground" />
                <span>Hold to delete</span>
              </LongPressButton>
            </div>

            {editingFolderId !== null && (
              <div className="space-y-2 border-t border-border/30 pt-2">
                <label className="text-[12px] font-medium text-muted-foreground">Transfer all saved lists to</label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleTransferLists(null)} className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground">{generalFolderName}</button>
                  {folders.filter((folder) => folder.id !== editingFolderId).map((folder) => (
                    <button key={folder.id} type="button" onClick={() => handleTransferLists(folder.id)} className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground">{folder.name}</button>
                  ))}
                </div>
              </div>
            )}

            {editingFolderId === null && (
              <div className="space-y-2 border-t border-border/30 pt-2">
                <label className="text-[12px] font-medium text-muted-foreground">Transfer all saved lists to</label>
                <div className="flex flex-wrap gap-2">
                  {folders.map((folder) => (
                    <button key={folder.id} type="button" onClick={() => handleTransferLists(folder.id)} className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground">{folder.name}</button>
                  ))}
                  {folders.length === 0 && <p className="text-[11px] text-muted-foreground/60">No folders to transfer to. Create a folder first.</p>}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-sm">
          <AlertDialogHeader className="pr-8">
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              {editingFolderId === null
                ? `Clear all saved lists in "${generalFolderName}"?`
                : `Delete "${editingFolderName}"? Saved lists will be moved to another folder.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {editingFolderId !== null && (
          <FolderDeleteOptions label="Move lists to">
              <FolderDeleteChoice onClick={() => setDeleteTargetFolderId(null)} selected={deleteTargetFolderId === null}>{generalFolderName}</FolderDeleteChoice>
              {folders.filter((folder) => folder.id !== editingFolderId).map((folder) => (
                <FolderDeleteChoice key={folder.id} onClick={() => setDeleteTargetFolderId(folder.id)} selected={deleteTargetFolderId === folder.id}>{folder.name}</FolderDeleteChoice>
              ))}
          </FolderDeleteOptions>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsDeleteConfirmOpen(false); setDeleteTargetFolderId(null) }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolderWithMigration} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="mt-4 text-center text-[11px] text-muted-foreground/50">
        Answered questions are stored locally, so you will not see the same question twice.
      </p>
    </div>
  )
}
