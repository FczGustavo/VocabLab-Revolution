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

  const cardRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const dragOffsetRef = useRef<{ x: number }>({ x: 0 })
  const rafIdRef = useRef<number | null>(null)
  const swipedRef = useRef(false)
  const isFlingingRef = useRef(false)
  const [cardKeyIndex, setCardKeyIndex] = useState(0)

  const advance = useCallback(async (knewIt: boolean, fromSwipe?: boolean) => {
    if (!current || exiting) return
    setShowShortcutCoach(false)
    setLastRating(knewIt ? "known" : "again")

    if (knewIt) {
      setKnownIds((ids) => new Set([...ids, current.id]))
      void onRecordResult?.(current.id, true)
      void onMarkAsLearned?.(current.id)
    } else {
      void onRecordResult?.(current.id, false)
      const nextWrongCount = (wrongCount[current.id] ?? 0) + 1
      setWrongCount((counts) => ({ ...counts, [current.id]: nextWrongCount }))
      if (isReviewMistakeThresholdReached(nextWrongCount, reviewMistakeThreshold)) {
        void onMarkForReview?.(current.id)
      }
    }

    if (!fromSwipe && animationsEnabled) {
      // Button click or keyboard shortcut: animate card exit via keyframes
      setExiting(knewIt ? "known" : "again")
      await new Promise((resolve) => window.setTimeout(resolve, 240))
    }

    setQueue((items) => {
      const [head, ...rest] = items
      const next = knewIt ? rest : [...rest, head]
      if (knewIt && next.length === 0) setFinished(true)
      return next
    })

    setFlipped(false)
    setShowTranslations(false)
    setExiting(null)
    isFlingingRef.current = false
    setCardKeyIndex((i) => i + 1)
  }, [animationsEnabled, current, exiting, onMarkAsLearned, onMarkForReview, onRecordResult, reviewMistakeThreshold, wrongCount])

  const handleTouchStart = (e: React.TouchEvent) => {
    if (exiting || isFlingingRef.current || e.touches.length !== 1) return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    dragOffsetRef.current.x = 0
    swipedRef.current = false
    if (cardRef.current) {
      cardRef.current.style.transition = "none"
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || exiting || isFlingingRef.current || e.touches.length !== 1) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    dragOffsetRef.current.x = dx

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const el = cardRef.current
        if (!el) return
        const currentX = dragOffsetRef.current.x
        el.style.transform = `translate3d(${currentX}px, 0, 0) rotate(${currentX * 0.05}deg)`
        if (currentX > 20) {
          el.style.borderColor = `rgba(34, 197, 94, ${Math.min(1, (currentX - 20) / 60)})`
        } else if (currentX < -20) {
          el.style.borderColor = `rgba(239, 68, 68, ${Math.min(1, (-currentX - 20) / 60)})`
        } else {
          el.style.borderColor = ""
        }
      })
    }
  }

  const handleTouchEnd = () => {
    if (!touchStartRef.current || exiting || isFlingingRef.current) return
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    const deltaX = dragOffsetRef.current.x
    const elapsed = Date.now() - touchStartRef.current.time
    touchStartRef.current = null

    const absX = Math.abs(deltaX)
    const minDistance = elapsed < 320 ? 45 : 75

    if (absX >= minDistance && cardRef.current) {
      swipedRef.current = true
      isFlingingRef.current = true
      setTimeout(() => { swipedRef.current = false }, 400)
      const targetX = deltaX > 0
        ? (typeof window !== "undefined" ? window.innerWidth + 120 : 500)
        : (typeof window !== "undefined" ? -window.innerWidth - 120 : -500)

      const el = cardRef.current
      el.style.transition = "transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease-in, border-color 0.2s ease"
      el.style.transform = `translate3d(${targetX}px, 0, 0) rotate(${targetX * 0.05}deg)`
      el.style.opacity = "0"

      setTimeout(() => {
        void advance(deltaX > 0, true)
      }, 210)
    } else {
      if (cardRef.current) {
        const el = cardRef.current
        el.style.transition = "transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.1), border-color 0.2s ease"
        el.style.transform = "translate3d(0, 0, 0) rotate(0deg)"
        el.style.borderColor = ""
      }
      if (absX < 8) {
        swipedRef.current = true
        setTimeout(() => { swipedRef.current = false }, 350)
        setFlipped((value) => !value)
      }
    }
  }

  const handleTouchCancel = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    touchStartRef.current = null
    isFlingingRef.current = false
    if (cardRef.current) {
      const el = cardRef.current
      el.style.transition = "transform 0.2s ease, border-color 0.2s ease"
      el.style.transform = "translate3d(0, 0, 0) rotate(0deg)"
      el.style.borderColor = ""
    }
  }

  useStudyKeyboardShortcuts({ enabled: !finished && Boolean(current), onKnown: () => void advance(true), onAgain: () => void advance(false), onReveal: () => setFlipped(true), onHide: () => setFlipped(false) })

  if (finished) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4"><div className="w-full max-w-md rounded-3xl border border-border/40 bg-card p-8 text-center shadow-xl"><div className="mx-auto flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10"><Trophy className="size-8 text-primary" /></div><h2 className="mt-5 text-2xl font-semibold text-foreground/85">Session complete</h2><p className="mt-2 text-sm text-muted-foreground">You reviewed all {flashcards.length} cards from &ldquo;{folderName}&rdquo;.</p><div className="mt-6 grid grid-cols-2 gap-3"><SessionStat label="I knew it" value={known} tone="text-success" /><SessionStat label="Again" value={Object.values(wrongCount).reduce((sum, value) => sum + value, 0)} tone="text-destructive" /></div><Button className="mt-6 w-full" onClick={onExit}>Back to folder</Button></div></div>
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <StudyHeader folderName={folderName} subtitle={title} progress={progress} current={known} total={flashcards.length} rating={lastRating} collapsed={headerCollapsed} onCollapsedChange={setHeaderCollapsed} onExit={onExit} trailing={studyTime.enabled ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-muted-foreground sm:text-sm"><Clock3 className="size-3.5 shrink-0" />{studyTime.formatted}</span> : undefined} />
      <StudyShortcutCoach visible={showShortcutCoach} animated={animationsEnabled} />

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background p-3 sm:p-8 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <div className="my-auto flex w-full max-w-[min(100%,350px)] flex-col justify-center sm:max-w-xl">
          <div
            ref={cardRef}
            key={`${current.id}-${cardKeyIndex}`}
            className={cn(
              "surface-card surface-card-elevated study-swipe-card relative flex w-full aspect-square max-h-[calc(100dvh-205px)] sm:aspect-auto sm:max-h-none sm:h-[430px] cursor-pointer flex-col rounded-[22px] sm:rounded-[26px] border-2 border-border/40 bg-card p-5 sm:p-7 text-left select-none",
              exiting === "known" && "study-card-exit-known",
              exiting === "again" && "study-card-exit-again"
            )}
            onClick={() => {
              if (swipedRef.current) {
                swipedRef.current = false
                return
              }
              if (!exiting && !isFlingingRef.current) setFlipped((value) => !value)
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === "Enter" && !exiting && !isFlingingRef.current && setFlipped((value) => !value)}
          >
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
