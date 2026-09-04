"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Clock3, Languages, Trophy, Volume2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { partOfSpeechLabels, partOfSpeechStudyColors } from "@/lib/constants"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { usePronunciation } from "@/hooks/use-pronunciation"
import { useAnimations } from "@/hooks/use-animations"
import type { Flashcard } from "@/lib/types"
import { StudyHeader, StudyShortcutCoach, useStudyKeyboardShortcuts } from "@/components/study-shell-controls"
import { useStudyHeaderPreference } from "@/hooks/use-study-header-preference"
import { useStudyElapsedTime } from "@/hooks/use-study-elapsed-time"
import { useReviewMistakeThreshold } from "@/hooks/use-review-mistake-threshold"
import { isReviewMistakeThresholdReached } from "@/lib/study-preferences"
import { GrammaticalFormBadge } from "@/components/grammatical-form-badge"
import { VerbTypeBadge } from "@/components/verb-type-badge"

function shuffle(cards: Flashcard[]) {
  const result = [...cards]
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

interface StudyModeProps {
  flashcards: Flashcard[]
  folderName: string
  folderId?: string | null
  onExit: () => void
  onMarkForReview?: (id: string) => Promise<boolean>
  onMarkAsLearned?: (id: string) => Promise<boolean>
  onRecordResult?: (id: string, knewIt: boolean) => Promise<boolean>
}

/** Shared VocabLab study surface: normal folders and review folders use this exact experience. */
export function StudyMode({ flashcards, folderName, folderId, onExit, onMarkForReview, onMarkAsLearned, onRecordResult }: StudyModeProps) {
  const { saveStudySession } = useGrammarProgress()
  const { showContext, contextInPortuguese, showIPA, pronunciationVoice, includeMultipleTranslations } = useAiPreferences()
  const { ensurePronunciation, resultFor } = usePronunciation()
  const { enabled: animationsEnabled } = useAnimations()
  const { threshold: reviewMistakeThreshold } = useReviewMistakeThreshold()
  const [queue, setQueue] = useState(() => shuffle(flashcards))
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [wrongCount, setWrongCount] = useState<Record<string, number>>({})
  const [flipped, setFlipped] = useState(false)
  const [showTranslations, setShowTranslations] = useState(false)
  const [finished, setFinished] = useState(false)
  const savedRef = useRef(false)
  const [lastRating, setLastRating] = useState<"known" | "again" | null>(null)
  const [exiting, setExiting] = useState<"known" | "again" | null>(null)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [showShortcutCoach, setShowShortcutCoach] = useState(true)
  const { startCollapsed } = useStudyHeaderPreference()
  const current = queue[0]
  const known = knownIds.size
  const progress = flashcards.length ? (known / flashcards.length) * 100 : 0
  const studyTime = useStudyElapsedTime(finished)
  const title = useMemo(() => `Flip cards · ${queue.length} remaining`, [queue.length])

  useEffect(() => {
    setFlipped(false)
    setShowTranslations(false)
  }, [current?.id])

  useEffect(() => setHeaderCollapsed(startCollapsed), [startCollapsed])

  useEffect(() => {
    if (!finished || savedRef.current) return
    const wordsToReview = Object.keys(wrongCount).map((id) => flashcards.find((card) => card.id === id)?.word).filter((word): word is string => Boolean(word))
    const mistakeCards = Object.keys(wrongCount).length
    const correctFirstTry = Math.max(0, flashcards.length - mistakeCards)
    saveStudySession({
      folderName,
      totalCards: flashcards.length,
      correctFirstTry,
      wordsToReview,
      mistakeCards,
      totalMistakes: Object.values(wrongCount).reduce((sum, count) => sum + count, 0),
      lab: "vocab",
      folderId,
      mode: "flip",
      cardIds: flashcards.map((card) => card.id),
      durationSeconds: studyTime.elapsedSeconds,
    })
    savedRef.current = true
  }, [finished, flashcards, folderId, folderName, saveStudySession, studyTime.elapsedSeconds, wrongCount])

  const speak = async (word: string) => {
    const normalized = word.trim().toLowerCase()
    if (!normalized) return
    let source = resultFor(normalized, pronunciationVoice).src
    if (!source) source = await ensurePronunciation(normalized, { voice: pronunciationVoice })
    if (source) {
      try {
        const audio = new Audio(source)
        await audio.play()
        return
      } catch { /* use browser speech below */ }
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(normalized)
      utterance.lang = "en-US"
      utterance.rate = 0.85
      window.speechSynthesis.speak(utterance)
    }
  }

  const advance = useCallback(async (knewIt: boolean) => {
    if (!current || exiting) return
    setShowShortcutCoach(false)
    setLastRating(knewIt ? "known" : "again")
    if (animationsEnabled) {
      setExiting(knewIt ? "known" : "again")
      await new Promise((resolve) => window.setTimeout(resolve, 260))
    }
    if (knewIt) {
      setKnownIds((ids) => new Set([...ids, current.id]))
      await onRecordResult?.(current.id, true)
      await onMarkAsLearned?.(current.id)
    } else {
      await onRecordResult?.(current.id, false)
      const nextWrongCount = (wrongCount[current.id] ?? 0) + 1
      setWrongCount((counts) => ({ ...counts, [current.id]: nextWrongCount }))
      if (isReviewMistakeThresholdReached(nextWrongCount, reviewMistakeThreshold)) {
        await onMarkForReview?.(current.id)
      }
    }
    setQueue((items) => {
      const [head, ...rest] = items
      const next = knewIt ? rest : [...rest, head]
      if (knewIt && next.length === 0) setFinished(true)
      return next
    })
    setExiting(null)
  }, [animationsEnabled, current, exiting, onMarkAsLearned, onMarkForReview, onRecordResult, reviewMistakeThreshold, wrongCount])

  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const swipedRef = useRef(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (exiting || e.touches.length !== 1) return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    dragOffsetRef.current = { x: 0, y: 0 }
    setDragOffset({ x: 0, y: 0 })
    setIsDragging(true)
    swipedRef.current = false
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || exiting || e.touches.length !== 1) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    dragOffsetRef.current = { x: dx, y: dy }
    setDragOffset({ x: dx, y: dy })
  }

  const handleTouchEnd = () => {
    if (!touchStartRef.current || exiting) return
    const { x: deltaX, y: deltaY } = dragOffsetRef.current
    const elapsed = Date.now() - touchStartRef.current.time
    touchStartRef.current = null
    setIsDragging(false)

    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)
    const minDistance = elapsed < 320 ? 40 : 70

    if (absX >= minDistance || absY >= minDistance) {
      swipedRef.current = true
      setTimeout(() => { swipedRef.current = false }, 350)
      setDragOffset({ x: 0, y: 0 })
      if (absX > absY) {
        // Horizontal swipe: Right = Known, Left = Again
        if (deltaX > 0) {
          void advance(true)
        } else {
          void advance(false)
        }
      } else {
        // Vertical swipe: Up = Flip (reveal back), Down = Return to front
        if (deltaY < 0) {
          setFlipped(true)
        } else {
          setFlipped(false)
        }
      }
    } else {
      // Return to center
      setDragOffset({ x: 0, y: 0 })
      if (absX < 8 && absY < 8) {
        swipedRef.current = true
        setTimeout(() => { swipedRef.current = false }, 350)
        setFlipped((value) => !value)
      }
    }
  }

  const handleTouchCancel = () => {
    touchStartRef.current = null
    setIsDragging(false)
    setDragOffset({ x: 0, y: 0 })
  }

  useStudyKeyboardShortcuts({ enabled: !finished && Boolean(current) && !exiting, onKnown: () => void advance(true), onAgain: () => void advance(false), onReveal: () => setFlipped(true), onHide: () => setFlipped(false) })

  if (finished) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4"><div className="w-full max-w-md rounded-3xl border border-border/40 bg-card p-8 text-center shadow-xl"><div className="mx-auto flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10"><Trophy className="size-8 text-primary" /></div><h2 className="mt-5 text-2xl font-semibold text-foreground/85">Session complete</h2><p className="mt-2 text-sm text-muted-foreground">You reviewed all {flashcards.length} cards from &ldquo;{folderName}&rdquo;.</p><div className="mt-6 grid grid-cols-2 gap-3"><SessionStat label="I knew it" value={known} tone="text-success" /><SessionStat label="Again" value={Object.values(wrongCount).reduce((sum, value) => sum + value, 0)} tone="text-destructive" /></div><Button className="mt-6 w-full" onClick={onExit}>Back to folder</Button></div></div>
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <StudyHeader folderName={folderName} subtitle={title} progress={progress} current={known} total={flashcards.length} rating={lastRating} collapsed={headerCollapsed} onCollapsedChange={setHeaderCollapsed} onExit={onExit} trailing={studyTime.enabled ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground sm:text-sm"><Clock3 className="size-3.5" />{studyTime.formatted}</span> : undefined} />
      <StudyShortcutCoach visible={showShortcutCoach} animated={animationsEnabled} />

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background p-3 sm:p-8 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <div className="my-auto flex w-full max-w-[min(100%,350px)] flex-col justify-center sm:max-w-xl">
          <div
            className={cn(
              "surface-card surface-card-elevated relative flex w-full aspect-square max-h-[calc(100dvh-205px)] sm:aspect-auto sm:max-h-none sm:h-[430px] cursor-pointer flex-col rounded-[22px] sm:rounded-[26px] bg-card p-5 sm:p-7 text-left select-none",
              exiting === "known" && "study-card-exit-known",
              exiting === "again" && "study-card-exit-again"
            )}
            style={{
              transform: isDragging
                ? `translate3d(${dragOffset.x}px, ${dragOffset.y * 0.4}px, 0) rotate(${dragOffset.x * 0.08}deg)`
                : undefined,
              transition: isDragging ? "none" : "transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease",
              boxShadow: isDragging && dragOffset.x > 25
                ? `0 0 0 2px rgba(34,197,94,${Math.min(0.8, dragOffset.x / 100)}), 0 10px 25px -5px rgba(34,197,94,0.3)`
                : isDragging && dragOffset.x < -25
                ? `0 0 0 2px rgba(239,68,68,${Math.min(0.8, -dragOffset.x / 100)}), 0 10px 25px -5px rgba(239,68,68,0.3)`
                : undefined,
              touchAction: "none",
            }}
            onClick={() => {
              if (swipedRef.current) {
                swipedRef.current = false
                return
              }
              if (!exiting) setFlipped((value) => !value)
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === "Enter" && !exiting && setFlipped((value) => !value)}
          >
            {isDragging && dragOffset.x > 35 && (
              <div
                className="pointer-events-none absolute top-4 right-4 z-20 rounded-full bg-success/20 border border-success/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-success"
                style={{ opacity: Math.min(1, (dragOffset.x - 35) / 45) }}
              >
                I knew it
              </div>
            )}
            {isDragging && dragOffset.x < -35 && (
              <div
                className="pointer-events-none absolute top-4 left-4 z-20 rounded-full bg-destructive/20 border border-destructive/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-destructive"
                style={{ opacity: Math.min(1, (-dragOffset.x - 35) / 45) }}
              >
                Again
              </div>
            )}
            {flipped ? <VocabularyBack card={current} showContext={showContext} contextInPortuguese={contextInPortuguese} showIPA={showIPA} includeMultipleTranslations={includeMultipleTranslations} translationsShown={showTranslations} onToggleTranslations={() => setShowTranslations((value) => !value)} onSpeak={() => void speak(current.word)} /> : <VocabularyFront card={current} onSpeak={() => void speak(current.word)} />}
          </div>
          <div className="mt-3 sm:mt-5 flex gap-3 shrink-0">
            <Button disabled={Boolean(exiting)} variant="outline" className="h-10 sm:h-11 flex-1 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => void advance(false)}><XCircle className="mr-1.5 size-4" />Again</Button>
            <Button disabled={Boolean(exiting)} className="h-10 sm:h-11 flex-1 bg-success text-white hover:bg-success/90" onClick={() => void advance(true)}><CheckCircle2 className="mr-1.5 size-4" />I knew it</Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function VocabularyFront({ card, onSpeak }: { card: Flashcard; onSpeak: () => void }) {
  return <><div className="flex items-center justify-between"><CardBadges card={card} /><Button variant="ghost" size="icon" className="size-7 rounded-lg text-muted-foreground hover:text-primary" onClick={(event) => { event.stopPropagation(); onSpeak() }}><Volume2 className="size-4" /></Button></div><div className="flex flex-1 flex-col items-center justify-center text-center"><h2 className="text-4xl xs:text-5xl font-medium tracking-tight text-foreground/80 sm:text-6xl break-words px-2">{card.word}</h2></div></>
}

function VocabularyBack({ card, showContext, contextInPortuguese, showIPA, includeMultipleTranslations, translationsShown, onToggleTranslations, onSpeak }: { card: Flashcard; showContext: boolean; contextInPortuguese: boolean; showIPA: boolean; includeMultipleTranslations: boolean; translationsShown: boolean; onToggleTranslations: () => void; onSpeak: () => void }) {
  const contextPrimary = contextInPortuguese ? card.usageNote : card.usageNoteEn
  const contextSecondary = contextInPortuguese ? card.usageNoteEn : card.usageNote
  const falseCognatePrimary = contextInPortuguese ? card.falseCognate?.warning : card.falseCognate?.warningEn
  const falseCognateSecondary = contextInPortuguese ? card.falseCognate?.warningEn : card.falseCognate?.warning
  const showFalseCognateContrast = card.catalogId?.startsWith("false-cognate-") === true && card.falseCognate?.isFalseCognate === true
  const translation = includeMultipleTranslations ? card.translation : card.translation.split("/")[0]?.trim()
  return <div className="animate-in fade-in duration-200 flex h-full min-h-0 flex-col"><div className="flex items-center justify-between"><CardBadges card={card} /><div className="flex gap-1"><Button variant="ghost" size="icon" className={cn("size-7 rounded-lg", translationsShown ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-primary")} onClick={(event) => { event.stopPropagation(); onToggleTranslations() }}><Languages className="size-4" /></Button><Button variant="ghost" size="icon" className="size-7 rounded-lg text-muted-foreground hover:text-primary" onClick={(event) => { event.stopPropagation(); onSpeak() }}><Volume2 className="size-4" /></Button></div></div><div className="flex-1 min-h-0 space-y-3 sm:space-y-4 overflow-y-auto pt-3 sm:pt-5 pr-1 scrollbar-hide"><p className="text-xl sm:text-2xl font-medium text-foreground/80 sm:text-4xl">{translation}</p>{showIPA && card.ipa && <p className="-mt-2 text-sm text-muted-foreground">/{card.ipa}/</p>}<div className="border-t border-border/40" /><section><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Example</p><p className="mt-2 sm:mt-3 text-base sm:text-lg italic leading-relaxed text-foreground/80">&ldquo;{card.example}&rdquo;</p>{translationsShown && card.exampleTranslation && <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">{card.exampleTranslation}</p>}</section>{showContext && (card.usageNote || card.usageNoteEn) && <section className="rounded-xl bg-muted/30 p-3 sm:p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Context</p>{contextPrimary && <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-foreground/80">{contextPrimary}</p>}{translationsShown && contextSecondary && <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted-foreground">{contextSecondary}</p>}{showFalseCognateContrast && falseCognatePrimary && <div className="mt-3 sm:mt-4 border-t border-border/50 pt-3 sm:pt-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">False cognate</p><p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-foreground/80">{falseCognatePrimary}</p>{translationsShown && falseCognateSecondary && <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted-foreground">{falseCognateSecondary}</p>}</div>}</section>}</div></div>
}

function CardBadges({ card }: { card: Flashcard }) {
  const { showGrammaticalForm } = useAiPreferences()
  return <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap"><Badge className={cn("h-5 border-0 px-2 text-[10px] font-medium leading-none", partOfSpeechStudyColors[card.partOfSpeech || "noun"])}>{partOfSpeechLabels[card.partOfSpeech || "noun"]}</Badge>{showGrammaticalForm && <GrammaticalFormBadge form={card.grammaticalForm} />}<VerbTypeBadge verbType={card.verbType} /></div>
}

function SessionStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-xl border border-border/40 bg-muted/30 p-3 text-left"><p className={cn("text-2xl font-semibold", tone)}>{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p></div>
}
