"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Languages,
  Loader2,
  Trophy,
  Volume2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnimations } from "@/hooks/use-animations";
import { useAiPreferences } from "@/hooks/use-ai-preferences";
import { usePronunciation } from "@/hooks/use-pronunciation";
import type { RegencyDisplayPreferences } from "@/hooks/use-regency-preferences";
import type { RegencyCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StudyHeader, StudyShortcutCoach, useStudyKeyboardShortcuts } from "@/components/study-shell-controls";
import { useStudyHeaderPreference } from "@/hooks/use-study-header-preference";
import { useStudyElapsedTime } from "@/hooks/use-study-elapsed-time";
import { useReviewMistakeThreshold } from "@/hooks/use-review-mistake-threshold";
import { useGrammarProgress } from "@/hooks/use-grammar-progress";
import { isReviewMistakeThresholdReached } from "@/lib/study-preferences";

export type RegencyStudyKind = "recall" | "flip" | "choice";

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildChoices(card: RegencyCard, cards: RegencyCard[]) {
  const correct = normalized(card.pattern);
  const family = shuffle(
    cards.filter(
      (candidate) => normalized(candidate.term) === normalized(card.term),
    ),
  );
  const sameCategory = shuffle(
    cards.filter((candidate) => candidate.category === card.category),
  );
  const remaining = shuffle(cards);
  const candidates = [...family, ...sameCategory, ...remaining].map(
    (candidate) => candidate.pattern,
  );
  const distractors: string[] = [];
  const seen = new Set([correct]);
  for (const pattern of candidates) {
    const key = normalized(pattern);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distractors.push(pattern);
    if (distractors.length === 3) break;
  }
  return shuffle([card.pattern, ...distractors]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a contextual cue by hiding the governed connector (or the first complement word). */
function buildCloze(card: RegencyCard) {
  const exactTerm = new RegExp(`\\b${escapeRegExp(card.term)}\\b`, "i");
  const stem =
    card.term.length > 4 && card.term.endsWith("e")
      ? card.term.slice(0, -1)
      : card.term;
  const inflectedTerm = new RegExp(
    `\\b(?:${escapeRegExp(stem)}[\\p{L}'’-]*${card.term.endsWith("e") ? `|${escapeRegExp(card.term)}[\\p{L}'’-]*` : ""})\\b`,
    "iu",
  );
  const irregularTerm = card.term.toLowerCase() === "pay" ? /\bpaid\b/i : null;
  const termMatch =
    exactTerm.exec(card.example) ??
    irregularTerm?.exec(card.example) ??
    inflectedTerm.exec(card.example);
  if (!termMatch) return { before: `${card.term} `, after: "" };

  const termEnd = termMatch.index + termMatch[0].length;
  const suffix = card.example.slice(termEnd);
  const connector = card.pattern
    .toLowerCase()
    .match(
      /(?:^|\+\s*)(about|against|as|at|by|for|from|in|of|on|to|with)(?=\s|\+|$)/,
    )?.[1];
  const hiddenMatch = connector
    ? new RegExp(`(\\s+)${escapeRegExp(connector)}(?=\\b)`, "i").exec(suffix)
    : /^(\s+)([\p{L}'’-]+)/u.exec(suffix);

  if (!hiddenMatch)
    return { before: card.example.slice(0, termEnd), after: suffix };
  const hiddenStart = termEnd + hiddenMatch.index;
  const hiddenLength = hiddenMatch[0].length;
  return {
    before: card.example.slice(0, hiddenStart) + (hiddenMatch[1] ?? " "),
    after: suffix.slice(hiddenMatch.index + hiddenLength),
  };
}

export function RegencyStudyMode({
  cards,
  folderName,
  folderId,
  mode,
  display,
  onMarkForReview,
  onMarkAsLearned,
  onRecordResult,
  onExit,
}: {
  cards: RegencyCard[];
  folderName: string;
  folderId?: string | null;
  mode: RegencyStudyKind;
  display: RegencyDisplayPreferences;
  onMarkForReview?: (id: string) => Promise<boolean>;
  onMarkAsLearned?: (id: string) => Promise<boolean>;
  onRecordResult?: (id: string, knewIt: boolean) => Promise<boolean>;
  onExit: () => void;
}) {
  const { enabled: animationsEnabled } = useAnimations();
  const { saveStudySession } = useGrammarProgress();
  const { threshold: reviewMistakeThreshold } = useReviewMistakeThreshold();
  const { pronunciationVoice } = useAiPreferences();
  const { ensurePronunciation, resultFor } = usePronunciation();
  const [queue, setQueue] = useState(() => shuffle(cards));
  const [known, setKnown] = useState(0);
  const [revealed, setRevealed] = useState(mode === "flip" ? false : false);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [finished, setFinished] = useState(false);
  const [lastRating, setLastRating] = useState<"known" | "again" | null>(null);
  const [exiting, setExiting] = useState<"known" | "again" | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [showShortcutCoach, setShowShortcutCoach] = useState(true);
  const { startCollapsed } = useStudyHeaderPreference();
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [translationVisible, setTranslationVisible] = useState(false);
  const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({});
  const savedRef = useRef(false);
  const current = queue[0];
  const progress = cards.length ? (known / cards.length) * 100 : 0;
  const studyTime = useStudyElapsedTime(finished);
  useEffect(() => setHeaderCollapsed(startCollapsed), [startCollapsed]);
  useEffect(() => {
    if (!finished || savedRef.current) return;
    const wordsToReview = Object.keys(wrongCounts)
      .map((id) => cards.find((card) => card.id === id)?.term)
      .filter((term): term is string => Boolean(term));
    saveStudySession({
      folderName,
      totalCards: cards.length,
      correctFirstTry: Math.max(0, cards.length - Object.keys(wrongCounts).length),
      wordsToReview,
      mistakeCards: Object.keys(wrongCounts).length,
      totalMistakes: Object.values(wrongCounts).reduce((sum, count) => sum + count, 0),
      lab: "regency",
      folderId,
      mode: mode === "choice" ? "multiple-choice" : mode === "recall" ? "active-recall" : "flip",
      cardIds: cards.map((card) => card.id),
      durationSeconds: studyTime.elapsedSeconds,
    });
    savedRef.current = true;
  }, [cards, finished, folderId, folderName, mode, saveStudySession, studyTime.elapsedSeconds, wrongCounts]);
  const title = useMemo(
    () =>
      mode === "recall"
        ? "Active recall"
        : mode === "choice"
          ? "Multiple choice"
          : "Flip cards",
    [mode],
  );
  const choices = useMemo(
    () => (current && mode === "choice" ? buildChoices(current, cards) : []),
    [cards, current, mode],
  );

  const answerVisible =
    mode === "recall"
      ? revealed
      : mode === "choice"
        ? Boolean(selectedChoice)
        : flipped;
  const audioText = current
    ? answerVisible
      ? current.example
      : current.term
    : "";
  const audioStatus = resultFor(audioText, pronunciationVoice).status;

  const speak = async (text: string) => {
    if (!text.trim()) return;
    let source = resultFor(text, pronunciationVoice).src;
    if (!source)
      source = await ensurePronunciation(text, { voice: pronunciationVoice });
    if (source) {
      try {
        await new Audio(source).play();
        return;
      } catch {
        // Fall through to the browser voice if a generated source cannot play.
      }
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number }>({ x: 0 });
  const rafIdRef = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const isFlingingRef = useRef(false);
  const [cardKeyIndex, setCardKeyIndex] = useState(0);

  const advance = async (correct: boolean, fromSwipe?: boolean) => {
    if (!current || exiting) return;
    setShowShortcutCoach(false);
    setLastRating(correct ? "known" : "again");

    if (correct) {
      setKnown((value) => value + 1);
      void onRecordResult?.(current.id, true);
      void onMarkAsLearned?.(current.id);
    } else {
      void onRecordResult?.(current.id, false);
      const nextWrongCount = (wrongCounts[current.id] ?? 0) + 1;
      setWrongCounts((counts) => ({ ...counts, [current.id]: nextWrongCount }));
      if (isReviewMistakeThresholdReached(nextWrongCount, reviewMistakeThreshold)) {
        void onMarkForReview?.(current.id);
      }
    }

    if (!fromSwipe && animationsEnabled) {
      setExiting(correct ? "known" : "again");
      await new Promise((resolve) => window.setTimeout(resolve, 240));
    }

    setQueue((items) => {
      const [, ...rest] = items;
      const next = correct ? rest : [...rest, current];
      if (!next.length) setFinished(true);
      return next;
    });
    setRevealed(false);
    setFlipped(false);
    setTranslationVisible(false);
    setSelectedChoice(null);
    setExiting(null);
    isFlingingRef.current = false;
    setCardKeyIndex((i) => i + 1);
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    return Boolean((target as HTMLElement | null)?.closest("button, [role='button'], a, input, select, textarea, [data-interactive='true']"));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== "flip" || exiting || isFlingingRef.current || e.touches.length !== 1) return;
    if (isInteractiveTarget(e.target)) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    dragOffsetRef.current.x = 0;
    swipedRef.current = false;
    if (cardRef.current) {
      cardRef.current.style.transition = "none";
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (mode !== "flip" || !touchStartRef.current || exiting || isFlingingRef.current || e.touches.length !== 1) return;
    if (isInteractiveTarget(e.target)) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    dragOffsetRef.current.x = dx;

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const el = cardRef.current;
        if (!el) return;
        const currentX = dragOffsetRef.current.x;
        el.style.transform = `translate3d(${currentX}px, 0, 0) rotate(${currentX * 0.05}deg)`;
        if (currentX > 20) {
          el.style.borderColor = `rgba(34, 197, 94, ${Math.min(1, (currentX - 20) / 60)})`;
        } else if (currentX < -20) {
          el.style.borderColor = `rgba(239, 68, 68, ${Math.min(1, (-currentX - 20) / 60)})`;
        } else {
          el.style.borderColor = "";
        }
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (mode !== "flip" || !touchStartRef.current || exiting || isFlingingRef.current) return;
    if (isInteractiveTarget(e.target)) {
      touchStartRef.current = null;
      return;
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const deltaX = dragOffsetRef.current.x;
    const elapsed = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    const absX = Math.abs(deltaX);
    const minDistance = elapsed < 320 ? 45 : 75;

    if (absX >= minDistance && cardRef.current) {
      swipedRef.current = true;
      isFlingingRef.current = true;
      setTimeout(() => { swipedRef.current = false; }, 400);
      const targetX = deltaX > 0
        ? (typeof window !== "undefined" ? window.innerWidth + 120 : 500)
        : (typeof window !== "undefined" ? -window.innerWidth - 120 : -500);

      const el = cardRef.current;
      el.style.transition = "transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease-in, border-color 0.2s ease";
      el.style.transform = `translate3d(${targetX}px, 0, 0) rotate(${targetX * 0.05}deg)`;
      el.style.opacity = "0";

      setTimeout(() => {
        void advance(deltaX > 0, true);
      }, 210);
    } else {
      if (cardRef.current) {
        const el = cardRef.current;
        el.style.transition = "transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.1), border-color 0.2s ease";
        el.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
        el.style.borderColor = "";
      }
      if (absX < 8) {
        swipedRef.current = true;
        setTimeout(() => { swipedRef.current = false; }, 350);
        setFlipped((value) => !value);
      }
    }
  };

  const handleTouchCancel = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    touchStartRef.current = null;
    isFlingingRef.current = false;
    if (cardRef.current) {
      const el = cardRef.current;
      el.style.transition = "transform 0.2s ease, border-color 0.2s ease";
      el.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
      el.style.borderColor = "";
    }
  };

  const choosePattern = (pattern: string) => {
    if (selectedChoice || exiting) return;
    setSelectedChoice(pattern);
  };

  const continueChoice = () => {
    if (!selectedChoice) return;
    const correct =
      normalized(selectedChoice) === normalized(current?.pattern ?? "");
    void advance(correct);
  };

  useStudyKeyboardShortcuts({
    enabled: Boolean(current) && !finished && !exiting,
    onKnown: () => (mode === "flip" || revealed ? void advance(true) : undefined),
    onAgain: () => (mode === "flip" || revealed ? void advance(false) : undefined),
    onReveal: () => (mode === "recall" ? setRevealed(true) : setFlipped(true)),
    onHide: () => (mode === "recall" ? setRevealed(false) : setFlipped(false)),
  });

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
            You reviewed all {cards.length} cards from “{folderName}”.
          </p>
          <Button className="mt-6 w-full" onClick={onExit}>
            Back to folder
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <StudyHeader folderName={folderName} subtitle={`${title} · ${queue.length} remaining`} progress={progress} current={known} total={cards.length} rating={lastRating} collapsed={headerCollapsed} onCollapsedChange={setHeaderCollapsed} onExit={onExit} trailing={studyTime.enabled ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-muted-foreground sm:text-sm"><Clock3 className="size-3.5 shrink-0" />{studyTime.formatted}</span> : undefined} />
      <StudyShortcutCoach visible={showShortcutCoach && mode === "flip"} animated={animationsEnabled} />

      {current && (
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background p-3 sm:px-8 sm:py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
          <div className="my-auto flex w-full max-w-[min(100%,350px)] flex-col justify-center sm:max-w-xl">
            <div
              ref={cardRef}
              key={`${current.id}-${cardKeyIndex}`}
              className={cn(
                "surface-card surface-card-elevated study-swipe-card relative flex w-full flex-col rounded-[22px] sm:rounded-[26px] border-2 border-border/40 bg-card p-5 sm:p-7 text-left select-none",
                mode === "choice"
                  ? "aspect-square max-h-[calc(100dvh-320px)] sm:aspect-auto sm:max-h-none sm:h-[clamp(260px,calc(100dvh-280px),420px)] overflow-hidden"
                  : "aspect-square max-h-[calc(100dvh-205px)] sm:aspect-auto sm:max-h-none sm:h-[430px]",
                mode === "flip" && "cursor-pointer",
                exiting === "known" && "study-card-exit-known",
                exiting === "again" && "study-card-exit-again",
              )}
              onClick={(event) => {
                if (swipedRef.current) {
                  swipedRef.current = false;
                  return;
                }
                if (isInteractiveTarget(event.target)) return;
                if (mode === "flip" && !exiting && !isFlingingRef.current) setFlipped((value) => !value);
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              role={mode === "flip" ? "button" : undefined}
              tabIndex={mode === "flip" ? 0 : undefined}
              onKeyDown={(event) => {
                if (isInteractiveTarget(event.target)) return;
                if (
                  event.key === "Enter" &&
                  mode === "flip" &&
                  !exiting &&
                  !isFlingingRef.current
                ) {
                  setFlipped((value) => !value);
                }
              }}
            >
              <div 
                className="absolute right-7 top-7 z-10 flex items-center gap-1"
                data-interactive="true"
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onTouchEnd={(event) => event.stopPropagation()}
              >
                {display.showTranslation && current.exampleTranslation && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-8 rounded-lg text-muted-foreground hover:text-primary",
                      translationVisible && "bg-primary/10 text-primary",
                    )}
                    title="Alternar tradução do exemplo"
                    aria-label="Alternar tradução do exemplo"
                    data-interactive="true"
                    onClick={(event) => {
                      event.stopPropagation();
                      setTranslationVisible((value) => !value);
                    }}
                  >
                    <Languages className="size-4" />
                  </Button>
                )}
                <Button
                  disabled={audioStatus === "loading"}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-8 rounded-lg text-muted-foreground hover:text-primary",
                    audioStatus === "loading" && "pointer-events-auto cursor-wait opacity-50",
                  )}
                  title={
                    answerVisible
                      ? "Play full example with AI audio"
                      : "Play term with AI audio"
                  }
                  aria-label="Ouvir áudio"
                  data-interactive="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (audioStatus === "loading") return;
                    void speak(audioText);
                  }}
                >
                  {audioStatus === "loading" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Volume2 className="size-4" />
                  )}
                </Button>
              </div>
              {mode === "flip" && flipped ? (
                <div className="flex h-full animate-in fade-in duration-200">
                  <BackContent
                    card={current}
                    translationVisible={translationVisible}
                    display={display}
                  />
                </div>
              ) : (
                <>
                  {display.showCategory && (
                    <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                      {display.showCategory && (
                      <span
                        className={cn(
                          "ghost-tag inline-flex h-5 w-fit shrink-0 items-center justify-center whitespace-nowrap px-2 py-0.5 text-[10px] font-medium leading-none",
                          current.category === "verb"
                            ? "bg-blue-500/10 text-blue-700 dark:bg-blue-700 dark:text-white/90"
                            : current.category === "noun"
                              ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-700 dark:text-white/90"
                              : "bg-amber-500/10 text-amber-700 dark:bg-amber-700 dark:text-white/90",
                        )}
                      >
                        {current.category === "verb"
                          ? "Verb"
                          : current.category === "noun"
                            ? "Noun"
                            : "Adjective"}
                      </span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    {mode === "choice" && selectedChoice ? (
                      <ChoiceFeedback
                        card={current}
                        correct={
                          normalized(selectedChoice) ===
                          normalized(current.pattern)
                        }
                        translationVisible={translationVisible}
                        display={display}
                      />
                    ) : mode === "recall" && revealed ? (
                      <BackContent
                        card={current}
                        translationVisible={translationVisible}
                        display={display}
                      />
                    ) : (
                      <ClozeFront
                        card={current}
                        translationVisible={translationVisible}
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            {mode === "choice" && (
              <div className="mt-2.5 sm:mt-3 space-y-1.5 sm:space-y-2 shrink-0">
                <div className="grid grid-cols-1 gap-1.5 sm:gap-2 sm:grid-cols-2">
                  {choices.map((pattern) => {
                    const isCorrect =
                      normalized(pattern) === normalized(current.pattern);
                    const isSelected =
                      normalized(pattern) === normalized(selectedChoice ?? "");
                    return (
                      <Button
                        key={pattern}
                        disabled={Boolean(selectedChoice) || Boolean(exiting)}
                        variant="outline"
                        className={cn(
                          "h-auto min-h-9 sm:min-h-10 justify-start whitespace-normal px-3 sm:px-4 py-1.5 sm:py-2 text-left text-xs sm:text-sm",
                          selectedChoice &&
                            isCorrect &&
                            "border-success/50 bg-success/10 text-success",
                          selectedChoice &&
                            isSelected &&
                            !isCorrect &&
                            "border-destructive/40 bg-destructive/10 text-destructive",
                        )}
                        onClick={() => choosePattern(pattern)}
                      >
                        {pattern}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  disabled={!selectedChoice || Boolean(exiting)}
                  aria-hidden={!selectedChoice}
                  tabIndex={selectedChoice ? 0 : -1}
                  className={cn("h-9 sm:h-10 w-full transition-none text-xs sm:text-sm", !selectedChoice && "invisible pointer-events-none")}
                  onClick={continueChoice}
                >
                  Continue
                </Button>
              </div>
            )}

            {mode === "recall" && !revealed && (
              <div className="mt-3 sm:mt-5 flex gap-2 shrink-0">
                <input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) =>
                    event.key === "Enter" && setRevealed(true)
                  }
                  placeholder="Type the missing construction (optional)"
                  className="h-10 sm:h-11 flex-1 rounded-xl border border-border/50 bg-card px-3 text-xs sm:text-sm outline-none focus:border-primary/50"
                />
                <Button className="h-10 sm:h-11" onClick={() => setRevealed(true)}>Reveal</Button>
              </div>
            )}
            {(mode === "flip" || revealed) && (
              <div className="mt-3 sm:mt-5 flex gap-3 shrink-0">
                <Button
                  disabled={Boolean(exiting)}
                  variant="outline"
                  className="h-10 sm:h-11 flex-1 border-destructive/20 text-destructive hover:bg-destructive/10"
                  onClick={() => void advance(false)}
                >
                  <XCircle className="mr-1.5 size-4" />
                  Again
                </Button>
                <Button
                  disabled={Boolean(exiting)}
                  className="h-10 sm:h-11 flex-1 bg-success text-white hover:bg-success/90"
                  onClick={() => void advance(true)}
                >
                  <CheckCircle2 className="mr-1.5 size-4" />I knew it
                </Button>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}

function ClozeFront({
  card,
  translationVisible,
}: {
  card: RegencyCard;
  translationVisible: boolean;
}) {
  const cloze = buildCloze(card);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Complete the construction
      </p>
      <h2 className="mt-3 text-3xl font-medium tracking-tight text-foreground/80 sm:text-4xl">
        {card.term}
      </h2>
      <p className="mt-8 text-xl leading-relaxed text-foreground/75 sm:text-2xl">
        “{cloze.before}
        <span className="mx-1 inline-block min-w-16 rounded-md border-b-2 border-primary/50 bg-primary/5 px-2 text-primary">
          ___
        </span>
        {cloze.after}”
      </p>
      {translationVisible && card.exampleTranslation && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {card.exampleTranslation}
        </p>
      )}
    </div>
  );
}

function TeachingNotes({
  card,
  display,
}: {
  card: RegencyCard;
  display: RegencyDisplayPreferences;
}) {
  if (
    (!display.showMeaning || !card.meaningPt) &&
    (!display.showContrast || !card.contrastPt)
  )
    return null;
  return (
    <div className="mt-4 space-y-2 text-left">
      {display.showMeaning && card.meaningPt && (
        <div className="context-bubble rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Meaning
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/75">
            {card.meaningPt}
          </p>
        </div>
      )}
      {display.showContrast && card.contrastPt && (
        <div className="context-bubble rounded-xl bg-primary/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/75">
            Compare
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/70">
            {card.contrastPt}
          </p>
        </div>
      )}
    </div>
  );
}

function ChoiceFeedback({
  card,
  correct,
  translationVisible,
  display,
}: {
  card: RegencyCard;
  correct: boolean;
  translationVisible: boolean;
  display: RegencyDisplayPreferences;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-center overflow-y-auto px-1 py-8 scrollbar-hide">
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.16em]",
          correct ? "text-success" : "text-destructive",
        )}
      >
        {correct ? "Correct" : "Review this construction"}
      </p>
      <p className="mt-2 text-3xl font-medium text-foreground/80">
        {card.pattern}
      </p>
      <TeachingNotes card={card} display={display} />
      {display.showExample && (
        <p className="mt-4 text-base italic leading-relaxed text-foreground/75">
          “{card.example}”
        </p>
      )}
      {display.showTranslation &&
        translationVisible &&
        card.exampleTranslation && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {card.exampleTranslation}
          </p>
        )}
    </div>
  );
}

function BackContent({
  card,
  translationVisible,
  display,
}: {
  card: RegencyCard;
  translationVisible: boolean;
  display: RegencyDisplayPreferences;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center overflow-y-auto py-8 text-center scrollbar-hide">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Pattern
      </p>
      <p className="mt-2 text-3xl font-medium text-foreground/80">
        {card.pattern}
      </p>
      <TeachingNotes card={card} display={display} />
      {display.showExample && (
        <>
          <div className="my-5 border-t border-border/40" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Example
          </p>
          <p className="mt-3 text-lg italic leading-relaxed text-foreground/80">
            “{card.example}”
          </p>
        </>
      )}
      {display.showTranslation &&
        translationVisible &&
        card.exampleTranslation && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {card.exampleTranslation}
          </p>
        )}
    </div>
  );
}
