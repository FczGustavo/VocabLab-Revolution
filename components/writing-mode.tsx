"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, Clock3, Languages, RotateCw, Trophy, Volume2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { partOfSpeechLabels, partOfSpeechWritingColors } from "@/lib/constants"
import { useAnimations } from "@/hooks/use-animations"
import { useStudyTimer } from "@/hooks/use-study-timer"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import type { Flashcard } from "@/lib/types"
import { StudyHeader, useStudyKeyboardShortcuts } from "@/components/study-shell-controls"
import { useStudyHeaderPreference } from "@/hooks/use-study-header-preference"
import { useReviewMistakeThreshold } from "@/hooks/use-review-mistake-threshold"
import { GrammaticalFormBadge } from "@/components/grammatical-form-badge"
import { VerbTypeBadge } from "@/components/verb-type-badge"

interface WritingModeProps {
  flashcards: Flashcard[]
  folderName: string
  onExit: () => void
  onMarkForReview?: (id: string) => Promise<boolean>
  onMarkAsLearned?: (id: string) => Promise<boolean>
  onRecordResult?: (id: string, knewIt: boolean) => Promise<boolean>
}

function shuffle(cards: Flashcard[]) {
  const result = [...cards]
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

/**
 * Active recall for the review queue. The answer field is deliberately optional:
 * learners can formulate it mentally, reveal the card, then rate their recall.
 */
export function WritingMode({ flashcards, folderName, onExit, onMarkForReview, onMarkAsLearned, onRecordResult }: WritingModeProps) {
  const { enabled: animationsEnabled } = useAnimations()
  const { enabled: studyTimerEnabled } = useStudyTimer()
  const { threshold: reviewMistakeThreshold } = useReviewMistakeThreshold()
  const { showContext, contextInPortuguese, showIPA, includeMultipleTranslations } = useAiPreferences()
  const [queue, setQueue] = useState<Flashcard[]>(() => shuffle(flashcards))
  const [answer, setAnswer] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [showTranslations, setShowTranslations] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [lastRating, setLastRating] = useState<"known" | "again" | null>(null)
  const [exiting, setExiting] = useState<"known" | "again" | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const { startCollapsed } = useStudyHeaderPreference()
  const startedAtRef = useRef(Date.now())
  const answerRef = useRef<HTMLInputElement>(null)
  const current = queue[0]
  const contextPrimary = contextInPortuguese ? current?.usageNote : current?.usageNoteEn
  const contextSecondary = contextInPortuguese ? current?.usageNoteEn : current?.usageNote
  const totalCards = flashcards.length

  useEffect(() => {
    setAnswer("")
    setRevealed(false)
    setShowTranslations(false)
    const focusId = window.setTimeout(() => answerRef.current?.focus(), 70)
    return () => window.clearTimeout(focusId)
  }, [current?.id])

  useEffect(() => setHeaderCollapsed(startCollapsed), [startCollapsed])

  useEffect(() => {
    if (!studyTimerEnabled || finished) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)))
    update()
    const timerId = window.setInterval(update, 1000)
    return () => window.clearInterval(timerId)
  }, [finished, studyTimerEnabled])

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    utterance.rate = 0.85
    window.speechSynthesis.speak(utterance)
  }

  const advance = useCallback(async (knew: boolean) => {
    if (!current || !revealed || exiting) return
    if (animationsEnabled) {
      setExiting(knew ? "known" : "again")
      await new Promise((resolve) => window.setTimeout(resolve, 260))
    }
    if (knew) {
      setCorrect((value) => value + 1)
      setRemovedIds((ids) => new Set([...ids, current.id]))
      await onRecordResult?.(current.id, true)
      await onMarkAsLearned?.(current.id)
    } else {
      setWrong((value) => value + 1)
      await onRecordResult?.(current.id, false)
      const nextWrongCount = (wrongCounts[current.id] ?? 0) + 1
      setWrongCounts((counts) => ({ ...counts, [current.id]: nextWrongCount }))
      if (reviewMistakeThreshold > 0 && nextWrongCount >= reviewMistakeThreshold) {
        await onMarkForReview?.(current.id)
      }
    }
    setLastRating(knew ? "known" : "again")

    setQueue((items) => {
      const [head, ...rest] = items
      const next = knew ? rest : [...rest, head]
      if (knew && next.length === 0) setFinished(true)
      return next
    })
    setExiting(null)
  }, [animationsEnabled, current, exiting, onMarkAsLearned, onMarkForReview, onRecordResult, revealed, reviewMistakeThreshold, wrongCounts])

  useStudyKeyboardShortcuts({ enabled: !finished && Boolean(current) && !exiting, onReveal: () => setRevealed(true), onHide: () => setRevealed(false) })

  const restart = () => {
    setQueue(shuffle(flashcards))
    setAnswer("")
    setRevealed(false)
    setShowTranslations(false)
    setCorrect(0)
    setWrong(0)
    setWrongCounts({})
    setFinished(false)
    setRemovedIds(new Set())
    setLastRating(null)
    setExiting(null)
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
  }

  if (finished) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-4">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-border/40 bg-card p-8 text-center shadow-xl">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10"><Trophy className="size-8 text-primary" /></div>
          <h2 className="mt-5 text-2xl font-semibold text-foreground/85">Review complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">You completed active recall for {totalCards} {totalCards === 1 ? "word" : "words"}.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            <Stat label="I knew it" value={correct} tone="text-success" />
            <Stat label="Again" value={wrong} tone="text-destructive" />
            {studyTimerEnabled && <Stat label="Time" value={formatElapsedTime(elapsedSeconds)} tone="text-foreground/80" />}
          </div>
          {removedIds.size > 0 && <p className="mt-4 text-xs text-success">{removedIds.size} {removedIds.size === 1 ? "card was" : "cards were"} removed from review.</p>}
          <div className="mt-6 space-y-2">
            <Button className="w-full" onClick={restart}><RotateCw className="mr-1.5 size-4" />Study again</Button>
            <Button variant="ghost" className="w-full" onClick={onExit}>Back to folder</Button>
          </div>
        </div>
      </div>
    )
  }

  if (!current) return null
  const progress = totalCards ? (correct / totalCards) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <StudyHeader folderName={folderName} subtitle={`Active recall · ${queue.length} remaining`} progress={progress} current={correct} total={totalCards} rating={lastRating} collapsed={headerCollapsed} onCollapsedChange={setHeaderCollapsed} onExit={onExit} trailing={studyTimerEnabled ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground sm:text-sm"><Clock3 className="size-3.5" />{formatElapsedTime(elapsedSeconds)}</span> : undefined} />
      <main className="flex flex-1 items-center justify-center bg-background p-4 sm:p-8">
        <div className="w-full max-w-xl">
          <div className="relative h-[430px] w-full select-none">
            {!revealed ? (
              <div className={cn("surface-card surface-card-elevated flex h-full flex-col rounded-[26px] bg-card p-7", animationsEnabled && "animate-in fade-in duration-200", exiting === "known" && "study-card-exit-known", exiting === "again" && "study-card-exit-again")}>
                <CardHeader card={current} onSpeak={() => speak(current.word)} />
                <div className="flex flex-1 flex-col items-center justify-center text-center"><h2 className="text-5xl font-medium tracking-tight text-foreground/80 sm:text-6xl">{current.word}</h2><p className="mt-4 text-sm text-muted-foreground">Recall its translation before revealing the card.</p></div>
              </div>
            ) : (
              <div className={cn("surface-card surface-card-elevated flex h-full flex-col overflow-hidden rounded-[26px] bg-card p-7", animationsEnabled && "animate-in fade-in duration-200", exiting === "known" && "study-card-exit-known", exiting === "again" && "study-card-exit-again")}>
                <CardHeader card={current} onSpeak={() => speak(current.word)} onToggleTranslations={() => setShowTranslations((value) => !value)} translationsShown={showTranslations} />
                <div className="flex-1 space-y-4 overflow-y-auto pr-1 scrollbar-hide sm:space-y-5">
                  <p className="text-2xl font-medium text-foreground/80 sm:text-4xl">{includeMultipleTranslations ? current.translation : current.translation.split("/")[0]?.trim()}</p>
                  {showIPA && current.ipa && <p className="-mt-2 text-sm font-medium tracking-wide text-muted-foreground/80">/{current.ipa}/</p>}
                  <div className="border-t border-border/40" />
                  <section><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Example</p><p className="mt-2 text-base italic leading-relaxed text-foreground">&ldquo;{current.example}&rdquo;</p>{showTranslations && current.exampleTranslation && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.exampleTranslation}</p>}</section>
                  {showContext && (current.usageNote || current.usageNoteEn) && <section className="rounded-xl bg-muted/30 p-4"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Context</p>{contextPrimary && <p className="mt-2 text-sm leading-relaxed text-foreground">{contextPrimary}</p>}{showTranslations && contextSecondary && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{contextSecondary}</p>}</section>}
                </div>
              </div>
            )}
          </div>

          {!revealed ? (
            <div className="mt-5 flex gap-2"><input ref={answerRef} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => event.key === "Enter" && setRevealed(true)} placeholder="Your answer (optional)" className="h-11 flex-1 rounded-xl border border-border/50 bg-card px-3 text-sm outline-none focus:border-primary/50" /><Button className="h-11" onClick={() => setRevealed(true)}>Reveal</Button></div>
          ) : (
            <div className="mt-5 flex gap-3">
              <Button disabled={Boolean(exiting)} variant="outline" className="h-11 flex-1 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => void advance(false)}><XCircle className="mr-1.5 size-4" />Again</Button>
              <Button disabled={Boolean(exiting)} className="h-11 flex-1 bg-success text-white hover:bg-success/90" onClick={() => void advance(true)}><CheckCircle2 className="mr-1.5 size-4" />I knew it</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function CardHeader({ card, onSpeak, onToggleTranslations, translationsShown }: { card: Flashcard; onSpeak: () => void; onToggleTranslations?: () => void; translationsShown?: boolean }) {
  const { showGrammaticalForm } = useAiPreferences()
  return <div className="mb-4 flex items-center justify-between gap-3"><div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-hide"><Badge className={cn("h-5 border-0 px-2 text-[10px] font-medium leading-none", partOfSpeechWritingColors[card.partOfSpeech || "noun"])}>{partOfSpeechLabels[card.partOfSpeech || "noun"]}</Badge>{showGrammaticalForm && <GrammaticalFormBadge form={card.grammaticalForm} />}<VerbTypeBadge verbType={card.verbType} /></div><div className="flex shrink-0 items-center gap-1">{onToggleTranslations && <Button variant="ghost" size="icon" className={cn("size-7 rounded-lg", translationsShown ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-primary")} onClick={onToggleTranslations}><Languages className="size-4" /></Button>}<Button variant="ghost" size="icon" className="size-7 rounded-lg text-muted-foreground hover:text-primary" onClick={onSpeak}><Volume2 className="size-4" /></Button></div></div>
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return <div className="rounded-xl border border-border/40 bg-muted/30 p-3"><p className={cn("text-2xl font-semibold", tone)}>{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p></div>
}
