"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  onExit: () => void
  onMarkForReview?: (id: string) => Promise<boolean>
  onMarkAsLearned?: (id: string) => Promise<boolean>
  onRecordResult?: (id: string, knewIt: boolean) => Promise<boolean>
}

/** Shared VocabLab study surface: normal folders and review folders use this exact experience. */
export function StudyMode({ flashcards, folderName, onExit, onMarkForReview, onMarkAsLearned, onRecordResult }: StudyModeProps) {
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
  const [saved, setSaved] = useState(false)
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
    if (!finished || saved) return
    const wordsToReview = Object.keys(wrongCount).map((id) => flashcards.find((card) => card.id === id)?.word).filter((word): word is string => Boolean(word))
    saveStudySession({ folderName, totalCards: flashcards.length, correctFirstTry: known, wordsToReview })
    setSaved(true)
  }, [finished, flashcards, folderName, known, saved, saveStudySession, wrongCount])

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
      if (reviewMistakeThreshold > 0 && nextWrongCount >= reviewMistakeThreshold) {
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

  useStudyKeyboardShortcuts({ enabled: !finished && Boolean(current) && !exiting, onKnown: () => void advance(true), onAgain: () => void advance(false), onReveal: () => setFlipped(true), onHide: () => setFlipped(false) })

  if (finished) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4"><div className="w-full max-w-md rounded-3xl border border-border/40 bg-card p-8 text-center shadow-xl"><div className="mx-auto flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10"><Trophy className="size-8 text-primary" /></div><h2 className="mt-5 text-2xl font-semibold text-foreground/85">Session complete</h2><p className="mt-2 text-sm text-muted-foreground">You reviewed all {flashcards.length} cards from &ldquo;{folderName}&rdquo;.</p><div className="mt-6 grid grid-cols-2 gap-3"><SessionStat label="I knew it" value={known} tone="text-success" /><SessionStat label="Again" value={Object.values(wrongCount).reduce((sum, value) => sum + value, 0)} tone="text-destructive" /></div><Button className="mt-6 w-full" onClick={onExit}>Back to folder</Button></div></div>
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <StudyHeader folderName={folderName} subtitle={title} progress={progress} current={known} total={flashcards.length} rating={lastRating} collapsed={headerCollapsed} onCollapsedChange={setHeaderCollapsed} onExit={onExit} trailing={studyTime.enabled ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground sm:text-sm"><Clock3 className="size-3.5" />{studyTime.formatted}</span> : undefined} />
      <StudyShortcutCoach visible={showShortcutCoach} animated={animationsEnabled} />

      <main className="flex flex-1 items-center justify-center bg-background p-4 sm:p-8">
        <div className="w-full max-w-xl">
          <div className={cn("surface-card surface-card-elevated flex h-[430px] w-full cursor-pointer flex-col rounded-[26px] bg-card p-7 text-left", exiting === "known" && "study-card-exit-known", exiting === "again" && "study-card-exit-again")} onClick={() => !exiting && setFlipped((value) => !value)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && !exiting && setFlipped((value) => !value)}>
            {flipped ? <VocabularyBack card={current} showContext={showContext} contextInPortuguese={contextInPortuguese} showIPA={showIPA} includeMultipleTranslations={includeMultipleTranslations} translationsShown={showTranslations} onToggleTranslations={() => setShowTranslations((value) => !value)} onSpeak={() => void speak(current.word)} /> : <VocabularyFront card={current} onSpeak={() => void speak(current.word)} />}
          </div>
          <div className="mt-5 flex gap-3">
            <Button disabled={Boolean(exiting)} variant="outline" className="h-11 flex-1 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => void advance(false)}><XCircle className="mr-1.5 size-4" />Again</Button>
            <Button disabled={Boolean(exiting)} className="h-11 flex-1 bg-success text-white hover:bg-success/90" onClick={() => void advance(true)}><CheckCircle2 className="mr-1.5 size-4" />I knew it</Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function VocabularyFront({ card, onSpeak }: { card: Flashcard; onSpeak: () => void }) {
  return <><div className="flex items-center justify-between"><CardBadges card={card} /><Button variant="ghost" size="icon" className="size-7 rounded-lg text-muted-foreground hover:text-primary" onClick={(event) => { event.stopPropagation(); onSpeak() }}><Volume2 className="size-4" /></Button></div><div className="flex flex-1 flex-col items-center justify-center text-center"><h2 className="text-5xl font-medium tracking-tight text-foreground/80 sm:text-6xl">{card.word}</h2></div></>
}

function VocabularyBack({ card, showContext, contextInPortuguese, showIPA, includeMultipleTranslations, translationsShown, onToggleTranslations, onSpeak }: { card: Flashcard; showContext: boolean; contextInPortuguese: boolean; showIPA: boolean; includeMultipleTranslations: boolean; translationsShown: boolean; onToggleTranslations: () => void; onSpeak: () => void }) {
  const contextPrimary = contextInPortuguese ? card.usageNote : card.usageNoteEn
  const contextSecondary = contextInPortuguese ? card.usageNoteEn : card.usageNote
  const translation = includeMultipleTranslations ? card.translation : card.translation.split("/")[0]?.trim()
  return <div className="animate-in fade-in duration-200 flex h-full flex-col"><div className="flex items-center justify-between"><CardBadges card={card} /><div className="flex gap-1"><Button variant="ghost" size="icon" className={cn("size-7 rounded-lg", translationsShown ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-primary")} onClick={(event) => { event.stopPropagation(); onToggleTranslations() }}><Languages className="size-4" /></Button><Button variant="ghost" size="icon" className="size-7 rounded-lg text-muted-foreground hover:text-primary" onClick={(event) => { event.stopPropagation(); onSpeak() }}><Volume2 className="size-4" /></Button></div></div><div className="flex-1 space-y-4 overflow-y-auto pt-5 scrollbar-hide"><p className="text-2xl font-medium text-foreground/80 sm:text-4xl">{translation}</p>{showIPA && card.ipa && <p className="-mt-2 text-sm text-muted-foreground">/{card.ipa}/</p>}<div className="border-t border-border/40" /><section><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Example</p><p className="mt-3 text-lg italic leading-relaxed text-foreground/80">&ldquo;{card.example}&rdquo;</p>{translationsShown && card.exampleTranslation && <p className="mt-2 text-sm text-muted-foreground">{card.exampleTranslation}</p>}</section>{showContext && (card.usageNote || card.usageNoteEn) && <section className="rounded-xl bg-muted/30 p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Context</p>{contextPrimary && <p className="mt-2 text-sm text-foreground/80">{contextPrimary}</p>}{translationsShown && contextSecondary && <p className="mt-2 text-sm text-muted-foreground">{contextSecondary}</p>}</section>}</div></div>
}

function CardBadges({ card }: { card: Flashcard }) {
  const { showGrammaticalForm } = useAiPreferences()
  return <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap"><Badge className={cn("h-5 border-0 px-2 text-[10px] font-medium leading-none", partOfSpeechStudyColors[card.partOfSpeech || "noun"])}>{partOfSpeechLabels[card.partOfSpeech || "noun"]}</Badge>{showGrammaticalForm && <GrammaticalFormBadge form={card.grammaticalForm} />}<VerbTypeBadge verbType={card.verbType} /></div>
}

function SessionStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-xl border border-border/40 bg-muted/30 p-3 text-left"><p className={cn("text-2xl font-semibold", tone)}>{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p></div>
}
