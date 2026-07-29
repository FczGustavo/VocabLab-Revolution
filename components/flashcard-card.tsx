"use client"

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"
import { Trash2, Volume2, Loader2, Languages, VolumeX, AlertCircle, RefreshCw, Pause, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { partOfSpeechLabels, partOfSpeechColors } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Flashcard, ClassifiedWord, PartOfSpeech, AlternativeForm, GrammaticalForm } from "@/lib/types"
import { useAnimations } from "@/hooks/use-animations"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { usePronunciation } from "@/hooks/use-pronunciation"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { GrammaticalFormBadge } from "@/components/grammatical-form-badge"
import { VerbTypeBadge } from "@/components/verb-type-badge"
import { grammaticalFormLabels, grammaticalForms } from "@/lib/grammatical-forms"
interface FlashcardCardProps {
  flashcard: Flashcard
  onDelete?: (id: string) => void
  onCreateFromAlternative?: (base: Flashcard, form: AlternativeForm) => Promise<void>
  onUpdateFlashcard?: (flashcard: Flashcard) => Promise<boolean>
  layout?: "grid" | "list" | "compact"
  squareCards?: boolean
}

// IndexedDB can contain cards created by older versions or interrupted AI
// responses. Never let an unknown stored tag crash the card renderer.
function safePartOfSpeech(value: unknown): PartOfSpeech {
  return typeof value === "string" && value in partOfSpeechLabels
    ? value as PartOfSpeech
    : "noun"
}
function PronunciationButton({
  word,
  size = "default",
  savedAudioSrc,
}: {
  word: string
  size?: "default" | "sm"
  savedAudioSrc?: string
}) {
  const { ensurePronunciation, regeneratePronunciation, resultFor } = usePronunciation()
  const { pronunciationVoice, showRegenerateAudioButton } = useAiPreferences()
  const [isPlaying, setIsPlaying] = useState(false)
  const [usedTtsFallback, setUsedTtsFallback] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  useEffect(() => {
    return () => {
      const context = audioCtxRef.current
      audioCtxRef.current = null
      if (context && context.state !== "closed") void context.close()
    }
  }, [])

  const playWithWebAudio = useCallback(async (dataUrl: string): Promise<boolean> => {
    try {
      const base64 = dataUrl.split(",")[1] || ""
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const ctx = getAudioContext()
      if (ctx.state === "suspended") await ctx.resume()
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer)
      if (audioBuffer.duration < 0.05) return false
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      setIsPlaying(true)
      source.onended = () => setIsPlaying(false)
      source.start(0)
      return true
    } catch {
      return false
    }
  }, [getAudioContext])

  const handleClick = async (event: MouseEvent) => {
    event.stopPropagation()
    const normalized = word.trim().toLowerCase()
    if (!normalized) return
    const cached = resultFor(normalized, pronunciationVoice)
    if (cached.status === "error") {
      speakWithBrowserTTS(normalized)
      return
    }
    let src = savedAudioSrc || cached.src
    if (!src) {
      src = await ensurePronunciation(normalized, { voice: pronunciationVoice })
      if (!src) {
        speakWithBrowserTTS(normalized)
        return
      }
    }
    const played = await playWithWebAudio(src)
    if (played) {
      setUsedTtsFallback(false)
    } else {
      setUsedTtsFallback(true)
      speakWithBrowserTTS(normalized)
    }
  }
  const speakWithBrowserTTS = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = "en-US"
    utter.rate = 0.85
    setIsPlaying(true)
    utter.onend = () => setIsPlaying(false)
    utter.onerror = () => setIsPlaying(false)
    window.speechSynthesis.speak(utter)
  }
  const handleRegenerate = async (event: MouseEvent) => {
    event.stopPropagation()
    const normalized = word.trim().toLowerCase()
    const newSrc = await regeneratePronunciation(normalized, { voice: pronunciationVoice })
    if (newSrc) {
      setUsedTtsFallback(false)
      const played = await playWithWebAudio(newSrc)
      if (!played) {
        setUsedTtsFallback(true)
        speakWithBrowserTTS(normalized)
      }
    }
  }
  const isSm = size === "sm"
  const iconClass = isSm ? "size-3" : "size-4"
  const audioIconClass = cn(iconClass, "text-muted-foreground")
  const btnClass = isSm ? "size-6 rounded-lg" : "size-8 rounded-lg"
  const normalized = word.trim().toLowerCase()
  const result = resultFor(normalized, pronunciationVoice)
  const hasSavedSrc = !!savedAudioSrc
  // Only show spinner when the user has ACTIVELY clicked (status === "loading").
  // "idle" means the user hasn't interacted yet — show the play icon, not a
  // spinner, so the card doesn't look like it's stuck loading.
  const isLoading = !hasSavedSrc && result.status === "loading"
  const isReady = (hasSavedSrc || result.status === "ready") && !isPlaying
  const hasError = result.status === "error"
  const effectiveStatus = isPlaying
    ? "playing"
    : isLoading
      ? "loading"
      : hasError
        ? "error"
        : isReady
          ? "ready"
          : "idle"
const statusLabel =
  effectiveStatus === "playing"
    ? "Playing AI audio…"
    : effectiveStatus === "loading"
      ? "Generating AI audio…"
      : effectiveStatus === "error"
        ? `${result.error || "Failed to generate audio."} Click to try again.`
        : effectiveStatus === "ready"
          ? "Audio ready. Click to listen."
          : "Generate AI audio";
  const icon = effectiveStatus === "playing" ? (
    <Pause className={cn(iconClass, "text-primary fill-primary")} strokeWidth={1.5} />
  ) : effectiveStatus === "loading" ? (
    <Loader2 className={cn(iconClass, "animate-spin text-primary")} />
  ) : effectiveStatus === "ready" ? (
    <Volume2 className={audioIconClass} />
  ) : effectiveStatus === "error" ? (
    <AlertCircle className={cn(iconClass, "text-destructive")} />
  ) : (
    <Volume2 className={audioIconClass} />
  )
  const buttonClass = cn(
    btnClass,
    "relative transition-colors",
    effectiveStatus === "loading" && "text-primary",
    effectiveStatus === "ready" && "text-muted-foreground hover:text-primary hover:bg-primary/10",
    effectiveStatus === "playing" && "bg-primary/15 text-primary",
    effectiveStatus === "error" && "text-destructive hover:bg-destructive/10"
  )
  const showRegenerate = (showRegenerateAudioButton || usedTtsFallback) && (effectiveStatus === "ready" || effectiveStatus === "error")
  return (
    <div className={cn("inline-flex items-center gap-0.5")} onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon"
        className={buttonClass}
        onClick={handleClick}
        title={statusLabel}
        aria-label={statusLabel}
      >
        {icon}
      </Button>
      {showRegenerate && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            isSm ? "size-5" : "size-6",
            "opacity-50 hover:opacity-100"
          )}
          onClick={handleRegenerate}
          title="Regerar pronúncia (limpa cache)"
          aria-label="Regerar pronúncia"
        >
          <RefreshCw className={isSm ? "size-2.5" : "size-3"} />
        </Button>
      )}
    </div>
  )
}
function PosTagDropdown({
  partOfSpeech,
}: {
  flashcard?: Flashcard
  partOfSpeech: string
  alternatives?: Flashcard["alternativeForms"]
  onCreateAlternative?: (form: Flashcard["alternativeForms"][number]) => void
}) {
  const safeTag = safePartOfSpeech(partOfSpeech)
  return (
    <Badge variant="outline" className={cn("text-[10px] h-5 border-0", partOfSpeechColors[safeTag])}>
      {partOfSpeechLabels[safeTag]}
    </Badge>
  )
}
function ClassifiedWordList({
  words,
  label,
  maxCount,
}: {
  words: ClassifiedWord[]
  label: string
  maxCount: number
}) {
  if (!words || words.length === 0) return null
  if (maxCount <= 0) return null
  const visible = words.slice(0, maxCount)
  if (visible.length === 0) return null
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        {label}:
      </span>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((item, idx) => {
          const t = item.type === "abstract" ? "figurative" : item.type
          const tag = t === "literal" ? "lit" : t === "slang" ? "slng" : "fig"
          const tone =
            t === "literal"
              ? "bg-blue-500/10 text-blue-700 dark:bg-blue-600 dark:text-white"
              : t === "slang"
                ? "bg-amber-500/10 text-amber-800 dark:bg-amber-600 dark:text-white"
                : "bg-purple-500/10 text-purple-700 dark:bg-purple-600 dark:text-white"
          return (
            <Badge
              key={idx}
              variant="outline"
              className={cn("ghost-tag text-[10px] font-medium py-0 px-2 h-5 border-0", tone)}
            >
              {item.word}
              <span className="ml-1 opacity-50 text-[8px] font-normal">
                ({tag})
              </span>
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
function normalizeUsageNotePlain(note: string): string {
  return note
    .replace(/\r\n/g, "\n")
    .replace(/\bn[aã]o\s+confundir\b[^.?!]*[.?!]?/gi, "")
    .replace(/\b(Como\s+[A-Za-zÀ-ÿ]+|Nuance|Estrutura\s+comum|Estrutura|Prefer[eê]ncia|Contraste|Outro\s+uso|Intensificador|Atenuador)\s*:\s*/gi, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
export function FlashcardCard({ flashcard, onDelete, onCreateFromAlternative, onUpdateFlashcard, layout = "grid", squareCards = false }: FlashcardCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [translationsVisible, setTranslationsVisible] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [translationDraft, setTranslationDraft] = useState("")
  const [contextPtDraft, setContextPtDraft] = useState("")
  const [contextEnDraft, setContextEnDraft] = useState("")
  const [grammaticalFormDraft, setGrammaticalFormDraft] = useState<GrammaticalForm>(flashcard.grammaticalForm ?? "base-form")
  const [editBusy, setEditBusy] = useState(false)
  const [generatingAlt, setGeneratingAlt] = useState<string | null>(null)
  const suppressFlipUntilRef = useRef(0)
  const consumeNextFlipRef = useRef(false)
  const { enabled: animationsEnabled } = useAnimations()
  const { includeSynonymsAntonyms, synonymsDisplayCount, includeConjugations, includeAlternativeForms, showContext, contextInPortuguese, showIPA, showGrammaticalForm, includeMultipleTranslations } = useAiPreferences()
  const partOfSpeech = safePartOfSpeech(flashcard.partOfSpeech)
  const isVerbCard = partOfSpeech === "verb" || partOfSpeech === "phrasal-verb"
  const isAiEnriching = Boolean(flashcard.aiEnriching)
  const usageNoteText = normalizeUsageNotePlain(flashcard.usageNote || "")
  const usageNoteEnText = flashcard.usageNoteEn || ""
  const contextPrimaryText = contextInPortuguese ? usageNoteText : usageNoteEnText
  const contextSecondaryText = contextInPortuguese ? usageNoteEnText : usageNoteText
  const ipaText = (flashcard.ipa ?? "").trim()
  const hasContext = showContext && (usageNoteText.length > 0 || usageNoteEnText.length > 0)
  const hasIpa = showIPA && ipaText.length > 0
  const hasExample = Boolean(flashcard.example?.trim())
  const hasExampleTranslation = Boolean(flashcard.exampleTranslation?.trim())
  const hasContextTranslation = contextSecondaryText.length > 0
  const hasTranslationToggle = hasExampleTranslation || hasContextTranslation
  const displayTranslation = includeMultipleTranslations
    ? flashcard.translation
    : (flashcard.translation ?? "").split("/").map((s) => s.trim()).filter(Boolean)[0] ?? flashcard.translation ?? ""
  const alternativeForms = includeAlternativeForms
    ? (flashcard.alternativeForms || []).filter(
        (f) => f.translation && f.partOfSpeech && f.partOfSpeech !== partOfSpeech
      )
    : []
  useEffect(() => {
    if (!editOpen) return
    setTranslationDraft(flashcard.translation || "")
    setContextPtDraft(flashcard.usageNote || "")
    setContextEnDraft(flashcard.usageNoteEn || "")
    setGrammaticalFormDraft(flashcard.grammaticalForm ?? "base-form")
  }, [editOpen, flashcard.translation, flashcard.usageNote, flashcard.usageNoteEn, flashcard.grammaticalForm])
  // Pronunciation is generated LAZILY on click — do NOT auto-fetch on mount.
  // Previously this fired ensurePronunciation() automatically, which showed
  // an infinite spinner while the slow gpt-audio-mini model generated audio
  // the user hadn't even asked for yet. The PronunciationButton handles
  // fetching on click via handleClick().
  const blockFlipTemporarily = (ms = 300) => {
    suppressFlipUntilRef.current = Date.now() + ms
  }
  const toggleFlipSafely = () => {
    if (editOpen || editBusy) return
    if (consumeNextFlipRef.current) {
      consumeNextFlipRef.current = false
      return
    }
    if (Date.now() < suppressFlipUntilRef.current) return
    setIsFlipped((value) => !value)
  }
  const closeEditDialog = () => {
    consumeNextFlipRef.current = true
    blockFlipTemporarily()
    setEditOpen(false)
  }
  const handleEditOpenChange = (open: boolean) => {
    if (editBusy) return
    if (!open) {
      closeEditDialog()
      return
    }
    setEditOpen(true)
  }
  const openCardEditor = (event: MouseEvent) => {
    event.stopPropagation()
    blockFlipTemporarily()
    setEditOpen(true)
  }
  const submitCardEdit = async () => {
    const nextValue = translationDraft.trim()
    if (!nextValue) return
    if (!onUpdateFlashcard) {
      toast({
        title: "Não foi possível salvar",
        description: "Atualização do card não está disponível nesta tela.",
        variant: "destructive",
      })
      return
    }
    setEditBusy(true)
    const t = toast({
      title: "Salvando alterações…",
      description: flashcard.word,
    })
    try {
      const updated: Flashcard = {
        ...flashcard,
        translation: nextValue,
        usageNote: contextPtDraft.trim(),
        usageNoteEn: contextEnDraft.trim(),
        grammaticalForm: grammaticalFormDraft,
      }
      const ok = await onUpdateFlashcard(updated)
      if (!ok) throw new Error("Falha ao atualizar o card no banco local.")
      t.update({
        id: t.id,
        title: "Card atualizado",
        description: "Tradução e contextos foram salvos.",
      })
      closeEditDialog()
    } catch (err) {
      t.update({
        id: t.id,
        title: "Erro ao atualizar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setEditBusy(false)
    }
  }
  const renderEditDialog = () => (
    <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
      <DialogContent className="max-w-[92vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar card</DialogTitle>
          <DialogDescription>
            Edite a tradução e os contextos de {flashcard.word}. Deixe um contexto vazio para removê-lo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Tradução</span>
            <Input autoFocus placeholder="Ex.: acusar / incriminar" disabled={editBusy} value={translationDraft} onChange={(event) => setTranslationDraft(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Forma gramatical</span>
            <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:border-ring" disabled={editBusy} value={grammaticalFormDraft} onChange={(event) => setGrammaticalFormDraft(event.target.value as GrammaticalForm)}>
              {grammaticalForms.map((form) => <option key={form} value={form}>{grammaticalFormLabels[form]}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Contexto em português</span>
            <Textarea placeholder="Deixe vazio para remover." disabled={editBusy} value={contextPtDraft} onChange={(event) => setContextPtDraft(event.target.value)} rows={3} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Contexto em inglês</span>
            <Textarea placeholder="Leave blank to remove it." disabled={editBusy} value={contextEnDraft} onChange={(event) => setContextEnDraft(event.target.value)} rows={3} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeEditDialog} disabled={editBusy}>Cancel</Button>
          <Button onClick={submitCardEdit} disabled={editBusy || !translationDraft.trim()}>
            {editBusy ? <><Loader2 className="mr-2 size-4 animate-spin" /> Salvando…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  // List Layout
  if (layout === "list") {
    return (
      <>
        <Card
          className="surface-card surface-card-elevated interactive-lift group relative flex cursor-pointer flex-col gap-3 p-4"
          onClick={toggleFlipSafely}
        >
          <div className="flex items-center gap-2">
            <h3 className="max-w-[45%] min-w-0 shrink truncate text-lg font-medium text-foreground/80">{flashcard.word}</h3>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <PronunciationButton word={flashcard.word} size="sm" savedAudioSrc={flashcard.audioSrc} />
              {onUpdateFlashcard && (
                <Button variant="ghost" size="icon" className="size-7" onClick={openCardEditor} title="Editar card" aria-label="Editar card">
                  <Pencil className="size-3.5 text-muted-foreground" />
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(flashcard.id) }}>
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              )}
              {hasTranslationToggle && isFlipped && (
                <Button variant="ghost" size="icon" className={cn("size-7 rounded-lg", translationsVisible ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-primary")} onClick={(e) => { e.stopPropagation(); setTranslationsVisible((v) => !v) }} title={translationsVisible ? "Hide translations" : "Show translations"}>
                  <Languages className="size-4" />
                </Button>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <PosTagDropdown partOfSpeech={partOfSpeech} />
              {showGrammaticalForm && <GrammaticalFormBadge form={flashcard.grammaticalForm} />}
              <VerbTypeBadge verbType={flashcard.verbType} />
              {flashcard.usageStatus === "archaic" && (
                <Badge variant="outline" className="ghost-tag h-5 border-0 bg-stone-500/10 text-[10px] font-medium text-stone-600 dark:bg-stone-600 dark:text-white">
                  Archaic
                </Badge>
              )}
            </div>
          </div>
          {!isFlipped && hasExample && (
            <p className="text-xs text-muted-foreground italic leading-snug truncate">{flashcard.example}</p>
          )}
          {isFlipped && (
            <div className="grid w-full gap-3 border-t border-border pt-3 animate-in fade-in slide-in-from-top-2 sm:grid-cols-2" style={{ animationDuration: animationsEnabled ? "300ms" : "0ms" }}>
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="max-w-full break-words text-base font-medium text-foreground/80">{displayTranslation}</p>
                  {hasIpa && <p className="text-[10px] font-medium text-muted-foreground/80 tracking-wide">/{ipaText}/</p>}
                  <div className="my-1 border-t border-border/60" />
                </div>
                {hasExample && (
                  <div>
                    <p className="text-[11px] text-foreground italic">{flashcard.example}</p>
                    {hasExampleTranslation && translationsVisible && <p className="text-[10px] text-muted-foreground mt-0.5">{flashcard.exampleTranslation}</p>}
                  </div>
                )}
                {includeSynonymsAntonyms && (flashcard.synonyms?.length ?? 0) > 0 && <ClassifiedWordList words={flashcard.synonyms} label="Synonyms" maxCount={synonymsDisplayCount} />}
                {includeSynonymsAntonyms && (flashcard.antonyms?.length ?? 0) > 0 && <ClassifiedWordList words={flashcard.antonyms} label="Antonyms" maxCount={synonymsDisplayCount} />}
              </div>
              <div className="space-y-2">
                {hasContext && (
                  <div className="context-bubble rounded-lg bg-muted/30 p-2.5">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      {partOfSpeech === "acronym" ? "Acronym" : partOfSpeech === "idiom" ? "Idiom" : "Context"}
                    </span>
                    {contextPrimaryText && <p className="mt-1 text-[11px] leading-relaxed text-foreground">{contextPrimaryText}</p>}
                    {hasContextTranslation && translationsVisible && <p className="mt-0.5 text-[9px] text-muted-foreground">{contextSecondaryText}</p>}
                  </div>
                )}
                {includeConjugations && flashcard.conjugations && isVerbCard && (
                  <div className="context-bubble rounded-lg bg-muted/30 p-2.5">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Verb Tenses</span>
                    <div className="mt-1 space-y-0.5">
                      {([
                        ["Simple Present", flashcard.conjugations.simplePresent],
                        ["Simple Past", flashcard.conjugations.simplePast],
                        ["Present Continuous", flashcard.conjugations.presentContinuous],
                        ["Past Continuous", flashcard.conjugations.pastContinuous],
                        ["Present Perfect", flashcard.conjugations.presentPerfect],
                        ["Past Perfect", flashcard.conjugations.pastPerfect],
                      ] as const).filter(([, val]) => val).map(([label, val]) => (
                        <div key={label} className="flex items-baseline gap-2 text-[9px]">
                          <span className="text-muted-foreground shrink-0 w-[95px]">{label}</span>
                          <span className="font-medium text-foreground/80">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {alternativeForms.length > 0 && (
                  <div className="context-bubble rounded-lg bg-muted/30 p-2.5">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Derivations</span>
                    <div className="mt-1.5 flex flex-col gap-2">
                      {alternativeForms.map((form, idx) => {
                        const isGenerating = generatingAlt === `${form.word}::${form.partOfSpeech}`
                        return (
                          <button key={idx} type="button" disabled={isGenerating} onClick={async (e) => { e.stopPropagation(); setGeneratingAlt(`${form.word}::${form.partOfSpeech}`); await onCreateFromAlternative?.(flashcard, form); setGeneratingAlt(null) }}
                            className="group relative flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border border-border/30 bg-card p-1.5 text-left transition-all hover:border-primary/40 hover:shadow-sm disabled:cursor-wait disabled:opacity-60">
                            {isGenerating ? (
                              <div className="flex items-center justify-center gap-1.5 py-1"><Loader2 className="size-3 animate-spin text-primary" /><span className="text-[9px] text-muted-foreground">Generating...</span></div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1"><span className="text-[10px] font-semibold text-foreground/80">{form.word}</span>
                                  <Badge variant="outline" className={cn("shrink-0 text-[7px] h-3 border-0 leading-none", partOfSpeechColors[form.partOfSpeech as keyof typeof partOfSpeechColors])}>{partOfSpeechLabels[form.partOfSpeech as keyof typeof partOfSpeechLabels]}</Badge>
                                </div>
                                <div className="my-0.5 border-t border-border/40" />
                                <p className="text-[9px] font-medium text-foreground/80 line-clamp-1">{includeMultipleTranslations ? form.translation : (form.translation || "").split("/").map(s => s.trim()).filter(Boolean)[0] || form.translation}</p>
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
        {renderEditDialog()}
      </>
    )
  }
  // Compact Layout
  if (layout === "compact") {
    return (
      <>
      <Card className="surface-card surface-card-elevated interactive-lift group relative h-28 min-h-24 cursor-pointer overflow-hidden" onClick={toggleFlipSafely}>
        <div className={cn(
          "absolute inset-0 p-3 flex flex-col transition-all",
          animationsEnabled ? "duration-300" : "duration-0",
          isFlipped ? "opacity-0 translate-y-[-100%]" : "opacity-100 translate-y-0"
        )}>
          <div className="flex justify-end">
            <div className="flex items-center gap-1 shrink-0">
              <Badge className={cn("text-[9px] px-1.5 h-4 leading-none border-0", partOfSpeechColors[partOfSpeech])}>
                {partOfSpeechLabels[partOfSpeech].substring(0, 3)}.
              </Badge>
              {showGrammaticalForm && <GrammaticalFormBadge form={flashcard.grammaticalForm} compact />}
              <VerbTypeBadge verbType={flashcard.verbType} compact />
              {isAiEnriching && (
                <Badge variant="outline" className="ghost-tag h-5 border-0 bg-primary/10 text-[10px] text-primary dark:bg-zinc-600 dark:text-white">
                  <Loader2 className="mr-1 size-3 animate-spin" /> IA
                </Badge>
              )}
            </div>
          </div>
          {onUpdateFlashcard && (
            <Button variant="ghost" size="icon" className="absolute left-2 top-2 size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={openCardEditor} title="Editar card" aria-label="Editar card">
              <Pencil className="size-3 text-muted-foreground" />
            </Button>
          )}
          <div className="flex-1 flex items-center justify-center">
            <h3 className="text-center text-base font-medium leading-snug text-foreground/80 truncate w-full">{flashcard.word}</h3>
          </div>
        </div>
        <div className={cn(
          "absolute inset-0 p-3 bg-primary/5 flex flex-col justify-center transition-all",
          animationsEnabled ? "duration-300" : "duration-0",
          isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[100%]"
        )}>
          <p className="text-sm font-medium text-center text-foreground/80">{displayTranslation}</p>
          {includeSynonymsAntonyms && (flashcard.synonyms?.length || flashcard.antonyms?.length) ? (
            <div className="mt-1.5 flex flex-wrap justify-center gap-1 px-1" onClick={(e) => e.stopPropagation()}>
              {flashcard.synonyms?.slice(0, synonymsDisplayCount).map((s, idx) => (
                <Badge key={`cs-${idx}`} variant="outline" className="ghost-tag border-0 bg-blue-500/10 px-1.5 py-0 text-[9px] font-medium text-blue-700 dark:bg-blue-600 dark:text-white">
                  {s.word}
                </Badge>
              ))}
              {flashcard.antonyms?.slice(0, synonymsDisplayCount).map((a, idx) => (
                <Badge key={`ca-${idx}`} variant="outline" className="ghost-tag border-0 bg-purple-500/10 px-1.5 py-0 text-[9px] font-medium text-purple-700 dark:bg-purple-600 dark:text-white">
                  {a.word}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex justify-center gap-1 mt-2">
            <PronunciationButton word={flashcard.word} size="sm" savedAudioSrc={flashcard.audioSrc} />
            {onUpdateFlashcard && (
              <Button variant="ghost" size="icon" className="size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={openCardEditor} title="Editar card" aria-label="Editar card">
                <Pencil className="size-3 text-muted-foreground" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="size-6 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(flashcard.id); }}>
                <Trash2 className="size-3 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      </Card>
      {renderEditDialog()}
      </>
    )
  }
  // Default Grid Layout
  return (
    <>
    <div
      className={cn("group perspective-1000 cursor-pointer", squareCards ? "aspect-square h-auto" : "h-[19rem] sm:h-80")}
      onClick={toggleFlipSafely}
    >
      <div
        className={cn(
          "relative h-full w-full transform-style-3d transition-transform",
          animationsEnabled ? "duration-500" : "duration-0",
          isFlipped && "rotate-y-180"
        )}
      >
        {/* Front */}
        <div className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col rounded-[20px] p-4 backface-hidden sm:rounded-[22px] sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <PosTagDropdown flashcard={flashcard} partOfSpeech={partOfSpeech} alternatives={flashcard.alternativeForms || []} onCreateAlternative={(form) => onCreateFromAlternative?.(flashcard, form)} />
              {showGrammaticalForm && <GrammaticalFormBadge form={flashcard.grammaticalForm} />}
              <VerbTypeBadge verbType={flashcard.verbType} />
              {flashcard.usageStatus === "archaic" && (
                <Badge variant="outline" className="ghost-tag h-5 border-0 bg-stone-500/10 text-[10px] font-medium text-stone-600 dark:bg-stone-600 dark:text-white">
                  Archaic
                </Badge>
              )}
              {isAiEnriching && (
                <Badge variant="outline" className="ghost-tag border-0 bg-primary/10 text-[10px] text-primary dark:bg-zinc-600 dark:text-white">
                  <Loader2 className="mr-1 size-3 animate-spin" /> IA completando
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <PronunciationButton word={flashcard.word} size="sm" savedAudioSrc={flashcard.audioSrc} />
              {onUpdateFlashcard && (
                <Button variant="ghost" size="icon" className="size-7" onClick={openCardEditor} title="Editar card" aria-label="Editar card">
                  <Pencil className="size-3.5 text-muted-foreground" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(flashcard.id)
                  }}
                >
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <h3 className="text-center text-2xl font-medium break-words text-foreground/80 sm:text-3xl md:text-[2rem]">
              {flashcard.word}
            </h3>
          </div>
        </div>
        {/* Back */}
        <div className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col overflow-hidden rounded-[20px] bg-card p-4 backface-hidden rotate-y-180 sm:rounded-[22px] sm:p-5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <PosTagDropdown flashcard={flashcard} partOfSpeech={partOfSpeech} alternatives={flashcard.alternativeForms || []} onCreateAlternative={(form) => onCreateFromAlternative?.(flashcard, form)} />
              {showGrammaticalForm && <GrammaticalFormBadge form={flashcard.grammaticalForm} />}
              <VerbTypeBadge verbType={flashcard.verbType} />
              {isAiEnriching && (
                <Badge variant="outline" className="ghost-tag border-0 bg-primary/10 text-[10px] text-primary dark:bg-zinc-600 dark:text-white">
                  <Loader2 className="mr-1 size-3 animate-spin" /> IA completando
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {hasTranslationToggle && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "size-7 rounded-lg",
                    translationsVisible
                      ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                      : "text-muted-foreground hover:text-primary"
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTranslationsVisible((v) => !v)
                  }}
                  title={translationsVisible ? "Hide translations" : "Show translations"}
                  aria-label="Toggle translations"
                >
                  <Languages className="size-4" />
                </Button>
              )}
              <PronunciationButton word={flashcard.word} size="sm" savedAudioSrc={flashcard.audioSrc} />
              {onUpdateFlashcard && (
                <Button variant="ghost" size="icon" className="size-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={openCardEditor} title="Editar card" aria-label="Editar card">
                  <Pencil className="size-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          <div className="no-scrollbar space-y-2.5 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            <div className="space-y-1.5">
              <p className="max-w-full break-words text-xl font-medium leading-snug text-foreground/80">{displayTranslation}</p>
              {hasIpa && (
                <p className="text-[12px] font-medium text-muted-foreground/80 tracking-wide">/{ipaText}/</p>
              )}
              {(hasContext || hasExample) && (
                <div className="my-1 border-t border-border/60" />
              )}
            </div>
            {hasExample && (
              <div>
                <p className="text-sm text-foreground italic mt-0.5">
                  {flashcard.example}
                </p>
                {hasExampleTranslation && translationsVisible && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {flashcard.exampleTranslation}
                  </p>
                )}
              </div>
            )}
            {hasContext && (
              <div className="context-bubble group/context rounded-xl bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {partOfSpeech === "acronym" ? "Acronym" : partOfSpeech === "idiom" ? "Idiom" : "Context"}
                  </span>
                </div>
                {contextPrimaryText && (
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground">{contextPrimaryText}</p>
                )}
                {hasContextTranslation && translationsVisible && (
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{contextSecondaryText}</p>
                )}
              </div>
            )}
            {includeConjugations && flashcard.conjugations && isVerbCard && (
              <div className="context-bubble rounded-xl bg-muted/30 p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Verb Tenses</span>
                <div className="mt-2 space-y-1">
                  {([
                    ["Simple Present", flashcard.conjugations.simplePresent],
                    ["Simple Past", flashcard.conjugations.simplePast],
                    ["Present Continuous", flashcard.conjugations.presentContinuous],
                    ["Past Continuous", flashcard.conjugations.pastContinuous],
                    ["Present Perfect", flashcard.conjugations.presentPerfect],
                    ["Past Perfect", flashcard.conjugations.pastPerfect],
                  ] as const).filter(([, val]) => val).map(([label, val]) => (
                    <div key={label} className="flex items-baseline gap-2 text-[11px]">
                      <span className="text-muted-foreground shrink-0 w-[110px]">{label}</span>
                      <span className="font-medium text-foreground/80">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {alternativeForms.length > 0 && (
              <>
                <div className="context-bubble rounded-xl bg-muted/30 p-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Derivations
                  </span>
                  <div className="mt-2 flex flex-col gap-2">
                    {alternativeForms.map((form, idx) => {
                      const isGenerating = generatingAlt === `${form.word}::${form.partOfSpeech}`
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isGenerating}
                          onClick={async (e) => {
                            e.stopPropagation()
                            const key = `${form.word}::${form.partOfSpeech}`
                            setGeneratingAlt(key)
                            await onCreateFromAlternative?.(flashcard, form)
                            setGeneratingAlt(null)
                          }}
                          className="group relative flex w-full cursor-pointer flex-col rounded-lg border border-border/30 bg-card p-2 text-left transition-all hover:border-primary/40 hover:shadow-sm disabled:cursor-wait disabled:opacity-60"
                        >
                          {isGenerating ? (
                            <div className="flex items-center justify-center gap-2 py-3">
                              <Loader2 className="size-4 animate-spin text-primary" />
                              <span className="text-xs text-muted-foreground">Generating...</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-foreground/80">{form.word}</span>
                                <Badge variant="outline" className={cn("shrink-0 text-[8px] h-3.5 border-0 leading-none", partOfSpeechColors[form.partOfSpeech as keyof typeof partOfSpeechColors])}>
                                  {partOfSpeechLabels[form.partOfSpeech as keyof typeof partOfSpeechLabels]}
                                </Badge>
                              </div>
                              <div className="my-1 border-t border-border/40" />
                              <p className="text-[11px] font-medium text-foreground/80 line-clamp-1">{includeMultipleTranslations ? form.translation : (form.translation || "").split("/").map(s => s.trim()).filter(Boolean)[0] || form.translation}</p>
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
            {(includeSynonymsAntonyms && (flashcard.synonyms?.length || flashcard.antonyms?.length)) ? (
              <div className="space-y-1.5 pt-2">
                {includeSynonymsAntonyms && (flashcard.synonyms?.length ?? 0) > 0 && (
                  <ClassifiedWordList words={flashcard.synonyms} label="Synonyms" maxCount={synonymsDisplayCount} />
                )}
                {includeSynonymsAntonyms && (flashcard.antonyms?.length ?? 0) > 0 && (
                  <ClassifiedWordList words={flashcard.antonyms} label="Antonyms" maxCount={synonymsDisplayCount} />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    {renderEditDialog()}
    </>
  )
}
