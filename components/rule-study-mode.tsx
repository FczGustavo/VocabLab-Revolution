"use client"

import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  Clock3,
  RotateCcw,
  Trophy,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  StudyHeader,
  StudyShortcutCoach,
  useStudyKeyboardShortcuts,
} from "@/components/study-shell-controls"
import { useStudyHeaderPreference } from "@/hooks/use-study-header-preference"
import { useStudyElapsedTime } from "@/hooks/use-study-elapsed-time"
import { useAnimations } from "@/hooks/use-animations"
import { useReviewMistakeThreshold } from "@/hooks/use-review-mistake-threshold"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { isReviewMistakeThresholdReached } from "@/lib/study-preferences"
import type { RuleCard } from "@/lib/types"
import { cn } from "@/lib/utils"

export type RuleStudyKind = "flip" | "recall"

const shuffle = <T,>(items: T[]) => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

interface RuleStudyModeProps {
  cards: RuleCard[]
  folderName: string
  folderId?: string | null
  mode: RuleStudyKind
  onExit: () => void
  onMarkForReview?: (id: string) => Promise<boolean>
  onMarkAsLearned?: (id: string) => Promise<boolean>
  onRecordResult?: (id: string, knewIt: boolean) => Promise<boolean>
}

export function RuleStudyMode({
  cards,
  folderName,
  folderId,
  mode,
  onExit,
  onMarkForReview,
  onMarkAsLearned,
  onRecordResult,
}: RuleStudyModeProps) {
  const { saveStudySession } = useGrammarProgress()
  const [queue, setQueue] = useState(() => shuffle(cards))
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({})
  const [flipped, setFlipped] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState("")
  const [finished, setFinished] = useState(false)
  const [exiting, setExiting] = useState<"known" | "again" | null>(null)
  const [lastRating, setLastRating] = useState<"known" | "again" | null>(null)
  const savedRef = useRef(false)
  const [showCoach, setShowCoach] = useState(true)
  const { startCollapsed } = useStudyHeaderPreference()
  const [headerCollapsed, setHeaderCollapsed] = useState(startCollapsed)
  const studyTime = useStudyElapsedTime(finished)
  const { enabled: animationsEnabled } = useAnimations()
  const { threshold: reviewMistakeThreshold } = useReviewMistakeThreshold()
  const current = queue[0]
  const title = mode === "flip" ? "Flip cards" : "Active recall"

  useEffect(() => setHeaderCollapsed(startCollapsed), [startCollapsed])

  useEffect(() => {
    if (!finished || savedRef.current) return
    const wordsToReview = Object.keys(wrongCounts)
      .map((id) => cards.find((card) => card.id === id)?.front)
      .filter((front): front is string => Boolean(front))
    saveStudySession({
      folderName,
      totalCards: cards.length,
      correctFirstTry: Math.max(0, cards.length - Object.keys(wrongCounts).length),
      wordsToReview,
      mistakeCards: Object.keys(wrongCounts).length,
      totalMistakes: Object.values(wrongCounts).reduce((sum, count) => sum + count, 0),
      lab: "rule",
      folderId,
      mode: mode === "recall" ? "active-recall" : "flip",
      cardIds: cards.map((card) => card.id),
      durationSeconds: studyTime.elapsedSeconds,
    })
    savedRef.current = true
  }, [cards, finished, folderId, folderName, mode, saveStudySession, studyTime.elapsedSeconds, wrongCounts])

  const advance = async (known: boolean) => {
    if (!current || exiting) return
    setShowCoach(false)
    setLastRating(known ? "known" : "again")
    if (animationsEnabled) {
      setExiting(known ? "known" : "again")
      await new Promise((resolve) => window.setTimeout(resolve, 260))
    }

    if (known) {
      await onRecordResult?.(current.id, true)
      setKnownIds((ids) => new Set(ids).add(current.id))
      await onMarkAsLearned?.(current.id)
      setQueue((items) => {
        const next = items.slice(1)
        if (!next.length) setFinished(true)
        return next
      })
    } else {
      await onRecordResult?.(current.id, false)
      const nextWrongCount = (wrongCounts[current.id] ?? 0) + 1
      setWrongCounts((items) => ({
        ...items,
        [current.id]: nextWrongCount,
      }))
      if (isReviewMistakeThresholdReached(nextWrongCount, reviewMistakeThreshold)) {
        await onMarkForReview?.(current.id)
      }
      setQueue((items) =>
        items.length <= 1 ? items : [...items.slice(1), current],
      )
    }

    setFlipped(false)
    setRevealed(false)
    setAnswer("")
    setExiting(null)
  }

  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const swipedRef = useRef(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== "flip" || exiting || e.touches.length !== 1) return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    dragOffsetRef.current = { x: 0, y: 0 }
    setDragOffset({ x: 0, y: 0 })
    setIsDragging(true)
    swipedRef.current = false
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (mode !== "flip" || !touchStartRef.current || exiting || e.touches.length !== 1) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    dragOffsetRef.current = { x: dx, y: dy }
    setDragOffset({ x: dx, y: dy })
  }

  const handleTouchEnd = () => {
    if (mode !== "flip" || !touchStartRef.current || exiting) return
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
        if (deltaX > 0) {
          void advance(true)
        } else {
          void advance(false)
        }
      } else {
        if (deltaY < 0) {
          setFlipped(true)
        } else {
          setFlipped(false)
        }
      }
    } else {
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

  useStudyKeyboardShortcuts({
    enabled: !finished && Boolean(current) && !exiting,
    onKnown: mode === "flip" ? () => void advance(true) : undefined,
    onAgain: mode === "flip" ? () => void advance(false) : undefined,
    onReveal:
      mode === "flip"
        ? () => setFlipped(true)
        : () => setRevealed(true),
    onHide:
      mode === "flip"
        ? () => setFlipped(false)
        : () => setRevealed(false),
  })

  const progress = cards.length ? (knownIds.size / cards.length) * 100 : 0
  const restart = () => {
    setQueue(shuffle(cards))
    setKnownIds(new Set())
    setWrongCounts({})
    setFinished(false)
    setLastRating(null)
    setShowCoach(true)
    setFlipped(false)
    setRevealed(false)
    setAnswer("")
    savedRef.current = false
  }

  if (finished) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-3xl border border-border/40 bg-card p-8 text-center shadow-xl">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Trophy className="size-8 text-primary" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-foreground/85">
            Session complete
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You reviewed all {cards.length} cards from &ldquo;{folderName}&rdquo;.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <SessionStat
              label="I knew it"
              value={knownIds.size}
              tone="text-success"
            />
            <SessionStat
              label="Again"
              value={Object.values(wrongCounts).reduce(
                (total, count) => total + count,
                0,
              )}
              tone="text-destructive"
            />
          </div>
          <div className="mt-6 grid gap-2">
            <Button className="w-full" onClick={restart}>
              <RotateCcw className="mr-1.5 size-4" />
              Study again
            </Button>
            <Button variant="ghost" className="w-full" onClick={onExit}>
              Back to folder
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!current) return null

  const answerVisible = mode === "flip" ? flipped : revealed
  const faceLabel =
    mode === "flip"
      ? flipped ? "Back" : "Front"
      : revealed ? "Answer" : "Prompt"
  const faceContent = answerVisible ? current.back : current.front

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <StudyHeader
        folderName={folderName}
        subtitle={title}
        progress={progress}
        current={knownIds.size}
        total={cards.length}
        rating={lastRating}
        collapsed={headerCollapsed}
        onCollapsedChange={setHeaderCollapsed}
        onExit={onExit}
        trailing={
          studyTime.enabled ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground sm:text-sm">
              <Clock3 className="size-3.5" />
              {studyTime.formatted}
            </span>
          ) : undefined
        }
      />
      <StudyShortcutCoach
        visible={showCoach && mode === "flip"}
        animated={animationsEnabled}
      />

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background p-3 sm:p-8 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
        <div className="my-auto flex w-full max-w-[min(100%,350px)] flex-col justify-center sm:max-w-xl">
          <article
            className={cn(
              "surface-card surface-card-elevated relative flex w-full aspect-square max-h-[calc(100dvh-205px)] sm:aspect-auto sm:max-h-none sm:h-[430px] flex-col overflow-hidden rounded-[22px] sm:rounded-[26px] bg-card p-5 sm:p-7 select-none",
              mode === "flip" && "cursor-pointer",
              exiting === "known" && "study-card-exit-known",
              exiting === "again" && "study-card-exit-again",
            )}
            style={mode === "flip" ? {
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
            } : undefined}
            onClick={() => {
              if (swipedRef.current) {
                swipedRef.current = false
                return
              }
              if (mode === "flip" && !exiting) setFlipped((value) => !value)
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onKeyDown={(event) => {
              if (mode === "flip" && event.key === "Enter" && !exiting) {
                setFlipped((value) => !value)
              }
            }}
            role={mode === "flip" ? "button" : undefined}
            tabIndex={mode === "flip" ? 0 : undefined}
          >
            {mode === "flip" && isDragging && dragOffset.x > 35 && (
              <div
                className="pointer-events-none absolute top-4 right-4 z-20 rounded-full bg-success/20 border border-success/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-success"
                style={{ opacity: Math.min(1, (dragOffset.x - 35) / 45) }}
              >
                I knew it
              </div>
            )}
            {mode === "flip" && isDragging && dragOffset.x < -35 && (
              <div
                className="pointer-events-none absolute top-4 left-4 z-20 rounded-full bg-destructive/20 border border-destructive/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-destructive"
                style={{ opacity: Math.min(1, (-dragOffset.x - 35) / 45) }}
              >
                Again
              </div>
            )}
            <div className="flex items-center">
              <Badge
                variant="outline"
                className="ghost-tag h-5 border-border/50 bg-muted/45 px-2 text-[10px] font-medium leading-none text-muted-foreground dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300"
              >
                {faceLabel}
              </Badge>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-2 text-center scrollbar-hide">
              <p className="max-w-full whitespace-pre-wrap text-[clamp(1.25rem,4vw,3rem)] font-medium leading-relaxed tracking-tight text-foreground/80 break-words">
                {faceContent}
              </p>
            </div>
          </article>

          {mode === "flip" || revealed ? (
            <StudyActions
              disabled={Boolean(exiting)}
              onAgain={() => void advance(false)}
              onKnown={() => void advance(true)}
            />
          ) : (
            <div className="mt-3 sm:mt-5 flex gap-2 shrink-0">
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Your answer (optional)"
                className="h-10 sm:h-11 min-h-10 sm:min-h-11 flex-1 resize-none rounded-xl border border-border/50 bg-card px-3 py-2 sm:py-2.5 text-xs sm:text-sm outline-none focus:border-primary/50"
              />
              <Button className="h-10 sm:h-11 shrink-0" onClick={() => setRevealed(true)}>
                Reveal
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function StudyActions({
  disabled,
  onAgain,
  onKnown,
}: {
  disabled: boolean
  onAgain: () => void
  onKnown: () => void
}) {
  return (
    <div className="mt-3 sm:mt-5 flex gap-3 shrink-0">
      <Button
        disabled={disabled}
        variant="outline"
        className="h-10 sm:h-11 flex-1 border-destructive/20 text-destructive hover:bg-destructive/10"
        onClick={onAgain}
      >
        <XCircle className="mr-1.5 size-4" />
        Again
      </Button>
      <Button
        disabled={disabled}
        className="h-10 sm:h-11 flex-1 bg-success text-white hover:bg-success/90"
        onClick={onKnown}
      >
        <CheckCircle2 className="mr-1.5 size-4" />
        I knew it
      </Button>
    </div>
  )
}

function SessionStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/30 p-3 text-left">
      <p className={cn("text-2xl font-semibold", tone)}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  )
}
