"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Languages,
  Loader2,
  Trophy,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAiPreferences } from "@/hooks/use-ai-preferences";
import { useAnimations } from "@/hooks/use-animations";
import { usePronunciation } from "@/hooks/use-pronunciation";
import { partOfSpeechLabels, partOfSpeechStudyColors } from "@/lib/constants";
import type { Flashcard } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  StudyHeader,
} from "@/components/study-shell-controls";
import { useStudyHeaderPreference } from "@/hooks/use-study-header-preference";
import { useStudyElapsedTime } from "@/hooks/use-study-elapsed-time";
import { useReviewMistakeThreshold } from "@/hooks/use-review-mistake-threshold";
import { useGrammarProgress } from "@/hooks/use-grammar-progress";
import { isReviewMistakeThresholdReached } from "@/lib/study-preferences";
import { GrammaticalFormBadge } from "@/components/grammatical-form-badge";
import { VerbTypeBadge } from "@/components/verb-type-badge";

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const normalized = (value: string) =>
  value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
const familyOf = (card: Flashcard) => normalized(card.familyKey || card.word);
const visibleTranslation = (value: string, includeMultiple: boolean) =>
  includeMultiple
    ? value
    : value.split("/").map((item) => item.trim()).filter(Boolean)[0] || value;

function buildChoices(card: Flashcard, cards: Flashcard[], includeMultiple: boolean) {
  const correct = normalized(visibleTranslation(card.translation, includeMultiple));
  const family = shuffle(
    cards.filter(
      (candidate) =>
        candidate.id !== card.id && familyOf(candidate) === familyOf(card),
    ),
  );
  const sameCategory = shuffle(
    cards.filter(
      (candidate) =>
        candidate.id !== card.id &&
        candidate.partOfSpeech === card.partOfSpeech,
    ),
  );
  const remaining = shuffle(
    cards.filter((candidate) => candidate.id !== card.id),
  );
  const choices: Flashcard[] = [card];
  const seen = new Set([correct]);
  for (const candidate of [...family, ...sameCategory, ...remaining]) {
    const key = normalized(visibleTranslation(candidate.translation, includeMultiple));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    choices.push(candidate);
    if (choices.length === 4) break;
  }
  return shuffle(choices);
}

interface VocabularyChoiceModeProps {
  flashcards: Flashcard[];
  folderName: string;
  folderId?: string | null;
  onExit: () => void;
  onMarkForReview?: (id: string) => Promise<boolean>;
  onMarkAsLearned?: (id: string) => Promise<boolean>;
  onRecordResult?: (id: string, knewIt: boolean) => Promise<boolean>;
}

export function VocabularyChoiceMode({
  flashcards,
  folderName,
  folderId,
  onExit,
  onMarkForReview,
  onMarkAsLearned,
  onRecordResult,
}: VocabularyChoiceModeProps) {
  const { enabled: animationsEnabled } = useAnimations();
  const { saveStudySession } = useGrammarProgress();
  const { threshold: reviewMistakeThreshold } = useReviewMistakeThreshold();
  const { pronunciationVoice, showIPA, showContext, contextInPortuguese, includeMultipleTranslations, showGrammaticalForm } =
    useAiPreferences();
  const { ensurePronunciation, resultFor } = usePronunciation();
  const [queue, setQueue] = useState(() => shuffle(flashcards));
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());
  const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTranslations, setShowTranslations] = useState(false);
  const [finished, setFinished] = useState(false);
  const [exiting, setExiting] = useState<"known" | "again" | null>(null);
  const savedRef = useRef(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const { startCollapsed } = useStudyHeaderPreference();
  const current = queue[0];
  const choices = useMemo(
    () => (current ? buildChoices(current, flashcards, includeMultipleTranslations) : []),
    [current, flashcards, includeMultipleTranslations],
  );
  const correct = Boolean(current && selectedId === current.id);
  const progress = flashcards.length
    ? (knownIds.size / flashcards.length) * 100
    : 0;
  const studyTime = useStudyElapsedTime(finished);

  useEffect(() => setHeaderCollapsed(startCollapsed), [startCollapsed]);

  useEffect(() => {
    if (!finished || savedRef.current) return;
    const wordsToReview = Object.keys(wrongCounts)
      .map((id) => flashcards.find((card) => card.id === id)?.word)
      .filter((word): word is string => Boolean(word));
    const mistakeCards = Object.keys(wrongCounts).length;
    saveStudySession({
      folderName,
      totalCards: flashcards.length,
      correctFirstTry: Math.max(0, flashcards.length - mistakeCards),
      wordsToReview,
      mistakeCards,
      totalMistakes: Object.values(wrongCounts).reduce((sum, count) => sum + count, 0),
      lab: "vocab",
      folderId,
      mode: "multiple-choice",
      cardIds: flashcards.map((card) => card.id),
      durationSeconds: studyTime.elapsedSeconds,
    });
    savedRef.current = true;
  }, [finished, flashcards, folderId, folderName, saveStudySession, studyTime.elapsedSeconds, wrongCounts]);

  const speak = async () => {
    if (!current) return;
    let source = resultFor(current.word, pronunciationVoice).src;
    if (!source)
      source = await ensurePronunciation(current.word, {
        voice: pronunciationVoice,
      });
    if (source) {
      try {
        await new Audio(source).play();
        return;
      } catch {
        // The network/model response may be valid but unsupported by a browser.
      }
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(current.word);
      utterance.lang = "en-US";
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const continueStudy = async (forcedKnew?: boolean) => {
    if (!current || !selectedId || exiting) return;
    const knew = forcedKnew ?? selectedId === current.id;
    if (animationsEnabled) {
      setExiting(knew ? "known" : "again");
      await new Promise((resolve) => window.setTimeout(resolve, 260));
    }
    if (knew) {
      await onRecordResult?.(current.id, true);
      setKnownIds((ids) => new Set([...ids, current.id]));
      await onMarkAsLearned?.(current.id);
    } else {
      await onRecordResult?.(current.id, false);
      const nextWrongCount = (wrongCounts[current.id] ?? 0) + 1;
      setWrongCounts((counts) => ({ ...counts, [current.id]: nextWrongCount }));
      if (isReviewMistakeThresholdReached(nextWrongCount, reviewMistakeThreshold)) {
        await onMarkForReview?.(current.id);
      }
    }
    setQueue((items) => {
      const [head, ...rest] = items;
      const next = knew ? rest : [...rest, head];
      if (!next.length) setFinished(true);
      return next;
    });
    setSelectedId(null);
    setShowTranslations(false);
    setExiting(null);
  };

  if (finished)
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
            You reviewed all {flashcards.length} cards from “{folderName}”.
          </p>
          <Button className="mt-6 w-full" onClick={onExit}>
            Back to folder
          </Button>
        </div>
      </div>
    );
  if (!current) return null;

  const contextPrimary = contextInPortuguese
    ? current.usageNote
    : current.usageNoteEn;
  const contextSecondary = contextInPortuguese
    ? current.usageNoteEn
    : current.usageNote;
  const falseCognatePrimary = contextInPortuguese ? current.falseCognate?.warning : current.falseCognate?.warningEn;
  const falseCognateSecondary = contextInPortuguese ? current.falseCognate?.warningEn : current.falseCognate?.warning;
  const showFalseCognateContrast = current.catalogId?.startsWith("false-cognate-") === true && current.falseCognate?.isFalseCognate === true;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <StudyHeader folderName={folderName} subtitle={`Multiple choice · ${queue.length} remaining`} progress={progress} current={knownIds.size} total={flashcards.length} collapsed={headerCollapsed} onCollapsedChange={setHeaderCollapsed} onExit={onExit} trailing={studyTime.enabled ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground sm:text-sm"><Clock3 className="size-3.5" />{studyTime.formatted}</span> : undefined} />
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:px-8 sm:py-3">
        <div className="w-full max-w-xl">
          <div
            className={cn(
              "surface-card surface-card-elevated flex h-[clamp(260px,calc(100dvh-280px),420px)] w-full flex-col overflow-hidden rounded-[26px] bg-card p-7",
              exiting === "known" && "study-card-exit-known",
              exiting === "again" && "study-card-exit-again",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <Badge
                  className={cn(
                    "h-5 border-0 px-2 text-[10px] font-medium leading-none",
                    partOfSpeechStudyColors[current.partOfSpeech],
                  )}
                >
                  {partOfSpeechLabels[current.partOfSpeech]}
                </Badge>
                {showGrammaticalForm && <GrammaticalFormBadge form={current.grammaticalForm} />}
                <VerbTypeBadge verbType={current.verbType} />
              </div>
              <div className="flex shrink-0 gap-1">
                {selectedId && current.exampleTranslation && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-7",
                      showTranslations && "bg-primary/10 text-primary",
                    )}
                    onClick={() => setShowTranslations((value) => !value)}
                  >
                    <Languages className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => void speak()}
                >
                  {resultFor(current.word, pronunciationVoice).status ===
                  "loading" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Volume2 className="size-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden text-center">
              {selectedId ? (
                <>
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-[0.16em]",
                      correct ? "text-success" : "text-destructive",
                    )}
                  >
                    {correct ? "Correct" : "Review this word"}
                  </p>
                  <h2 className="mt-3 text-4xl font-medium text-foreground/80">
                    {current.word}
                  </h2>
                  <p className="mt-4 text-2xl text-foreground/75">
                    {visibleTranslation(current.translation, includeMultipleTranslations)}
                  </p>
                  {showIPA && current.ipa && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      /{current.ipa}/
                    </p>
                  )}
                  <p className="mt-5 text-base italic text-foreground/70">
                    “{current.example}”
                  </p>
                  {showTranslations && current.exampleTranslation && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {current.exampleTranslation}
                    </p>
                  )}
                  {showContext && contextPrimary && (
                    <div className="mt-4 w-full rounded-xl bg-muted/30 p-3 text-left text-sm text-foreground/75">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Context</p>
                      <p className="mt-2">{contextPrimary}</p>
                      {showTranslations && contextSecondary && (
                        <p className="mt-2 text-muted-foreground">
                          {contextSecondary}
                        </p>
                      )}
                      {showFalseCognateContrast && falseCognatePrimary && (
                        <div className="mt-3 border-t border-border/50 pt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">False cognate</p>
                          <p className="mt-2">{falseCognatePrimary}</p>
                          {showTranslations && falseCognateSecondary && <p className="mt-2 text-muted-foreground">{falseCognateSecondary}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Choose the correct meaning
                  </p>
                  <h2 className="mt-4 text-5xl font-medium tracking-tight text-foreground/80">
                    {current.word}
                  </h2>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {choices.map((choice) => (
                <Button
                  key={choice.id}
                  disabled={Boolean(selectedId) || Boolean(exiting)}
                  variant="outline"
                  className={cn(
                    "h-auto min-h-10 justify-start whitespace-normal px-4 py-2 text-left",
                    selectedId &&
                      choice.id === current.id &&
                      "border-success/50 bg-success/10 text-success",
                    selectedId === choice.id &&
                      choice.id !== current.id &&
                      "border-destructive/40 bg-destructive/10 text-destructive",
                  )}
                  onClick={() => setSelectedId(choice.id)}
                >
                  {visibleTranslation(choice.translation, includeMultipleTranslations)}
                </Button>
              ))}
            </div>
            <Button
              disabled={!selectedId || Boolean(exiting)}
              aria-hidden={!selectedId}
              tabIndex={selectedId ? 0 : -1}
              className={cn("h-10 w-full transition-none", !selectedId && "invisible pointer-events-none")}
              onClick={() => void continueStudy()}
            >
              <CheckCircle2 className="mr-2 size-4" />
              Continue
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
