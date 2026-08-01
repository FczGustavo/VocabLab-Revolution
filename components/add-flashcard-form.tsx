"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Plus, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { partOfSpeechLabels } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { readAllFlashcardsFromDB } from "@/hooks/use-flashcards-db"
import { toast } from "@/hooks/use-toast"
import type { Flashcard, GrammaticalForm, PartOfSpeech } from "@/lib/types"
import type { FlashcardAIResponse } from "@/lib/openai"
import { getFamilyMembers, validateFamilyMembers, filterArchaicAlternativeForms, normalizeFamilyKey } from "@/lib/flashcard-create"
import { grammaticalFormLabels, grammaticalForms, normalizeGrammaticalForm } from "@/lib/grammatical-forms"

const AI_PREDICTION_CACHE_LIMIT = 100
const aiPredictionCache = new Map<string, string[]>()

function readCachedPredictions(prefix: string) {
  const cached = aiPredictionCache.get(prefix)
  if (!cached) return undefined
  aiPredictionCache.delete(prefix)
  aiPredictionCache.set(prefix, cached)
  return cached
}

function cachePredictions(prefix: string, suggestions: string[]) {
  aiPredictionCache.delete(prefix)
  aiPredictionCache.set(prefix, suggestions)
  while (aiPredictionCache.size > AI_PREDICTION_CACHE_LIMIT) {
    const oldest = aiPredictionCache.keys().next().value
    if (typeof oldest !== "string") break
    aiPredictionCache.delete(oldest)
  }
}

function isExpandedAcronymInput(raw: string): boolean {
  const normalized = raw.trim()
  // Ex: "challenging water quality (cwq)"
  return /^.+\s+\([a-z0-9]{2,}\)$/i.test(normalized)
}

function aiResponseToFlashcard(data: FlashcardAIResponse, sourceWord: string, folderId: string | null): Flashcard {
  const typedWord = sourceWord.trim().replace(/\s+/g, " ")
  const keepTypedWord = isExpandedAcronymInput(typedWord)

  return {
    id: crypto.randomUUID(),
    word: keepTypedWord ? typedWord : data.normalizedWord.toLowerCase(),
    partOfSpeech: data.partOfSpeech as PartOfSpeech,
    grammaticalForm: normalizeGrammaticalForm(data.grammaticalForm),
    translation: data.translation,
    ipa: data.ipa || "",
    usageNote: data.usageNote || "",
    usageNoteEn: data.usageNoteEn || "",
    synonyms: data.synonyms,
    antonyms: data.antonyms,
    example: data.example,
    exampleTranslation: (data as any).exampleTranslation || "",
    alternativeForms: filterArchaicAlternativeForms(
      (data.alternativeForms || []).map((f) => ({
        ...f,
        partOfSpeech: f.partOfSpeech as PartOfSpeech,
      })),
      data.normalizedWord || typedWord
    ),
    conjugations: data.conjugations ?? undefined,
    verbType: data.verbType ?? undefined,
    falseCognate: undefined,
    familyKey: normalizeFamilyKey(data.familyKey || data.normalizedWord),
    usageStatus: data.usageStatus ?? "current",
    folderId,
    createdAt: Date.now(),
  }
}

interface AddFlashcardFormProps {
  onAdd: (flashcard: Flashcard, meta?: { closeAfterAdd?: boolean }) => Promise<boolean>
  onUpdate?: (flashcard: Flashcard) => Promise<boolean>
  bare?: boolean
  folderId?: string | null
  pipelineMode?: boolean
  onPipelineEnqueue?: (folderId: string | null, itemCount: number, job: () => Promise<void>) => void
  beforeSubmit?: () => boolean
}

export function AddFlashcardForm({ onAdd, onUpdate, bare, folderId = null, pipelineMode = false, onPipelineEnqueue, beforeSubmit }: AddFlashcardFormProps) {
  const { model } = useGptModel()
  const {
    includeSynonymsAntonyms,
    synonymsDisplayCount,
    includeAlternativeForms,
    showContext,
    showIPA,
    efommMode,
    includeMultipleTranslations,
    showManualOptionalFields,
    useAiPredictions,
  } = useAiPreferences()
  const [mode, setMode] = useState<"single" | "batch" | "manual">("single")
  const [word, setWord] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const [batchText, setBatchText] = useState("")
  const [manualWord, setManualWord] = useState("")
  const [manualPartOfSpeech, setManualPartOfSpeech] = useState<PartOfSpeech>("noun")
  const [manualGrammaticalForm, setManualGrammaticalForm] = useState<GrammaticalForm>("base-form")
  const [manualTranslation, setManualTranslation] = useState("")
  const [manualExample, setManualExample] = useState("")
  const [manualExampleTranslation, setManualExampleTranslation] = useState("")
  const [manualUsageNote, setManualUsageNote] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchDone, setBatchDone] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saveFlash, setSaveFlash] = useState<"success" | "error" | null>(null)
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState("")

  // Typing animation for placeholder
  useEffect(() => {
    if (word.length > 0 || mode !== "single") return

    const words = ["Hello", "Beautiful", "Amazing", "Wonderful", "Fantastic", "Brilliant", "Awesome", "Perfect"]
    let wordIdx = 0
    let charIdx = 0
    let isDeleting = false
    let timeout: NodeJS.Timeout

    const animate = () => {
      const currentWord = words[wordIdx]

      if (!isDeleting) {
        setAnimatedPlaceholder(currentWord.slice(0, charIdx + 1))
        charIdx++

        if (charIdx === currentWord.length) {
          isDeleting = true
          timeout = setTimeout(animate, 1500)
          return
        }
        timeout = setTimeout(animate, 100)
      } else {
        setAnimatedPlaceholder(currentWord.slice(0, charIdx))
        charIdx--

        if (charIdx < 0) {
          isDeleting = false
          charIdx = 0
          wordIdx = (wordIdx + 1) % words.length
          timeout = setTimeout(animate, 500)
          return
        }
        timeout = setTimeout(animate, 50)
      }
    }

    timeout = setTimeout(animate, 1000)
    return () => clearTimeout(timeout)
  }, [word, mode])

  const triggerSaveFlash = (tone: "success" | "error") => {
    if (!showManualOptionalFields) return
    setSaveFlash(tone)
    window.setTimeout(() => setSaveFlash(null), 900)
  }

  

  const parseBatchWords = (text: string) => {
    const parts = text
      .split(/[\n,;]+/g)
      .map((w) => w.trim())
      .filter(Boolean)
    return [...new Set(parts)]
  }

  const findExistingPartsOfSpeech = async (input: string) => {
    const normalized = input.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
    const deck = await readAllFlashcardsFromDB().catch(() => [])
    return [...new Set(deck
      .filter((card) => card.word.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") === normalized)
      .map((card) => card.partOfSpeech))]
  }

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (beforeSubmit && !beforeSubmit()) return
    const inputWord = word.trim()
    if (!inputWord) return

    const run = async () => {
      if (!pipelineMode) setIsLoading(true)
      setError(null)
      try {
      const existingPartsOfSpeech = await findExistingPartsOfSpeech(inputWord)
      const res = await fetch("/api/ai/flashcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: inputWord,
          model,
          options: {
            includeSynonymsAntonyms: true,
            synonymsLevel: 3,
            includeConjugations: true,
            includeAlternativeForms,
            includeUsageNote: true,
            includeIpa: true,
            efommMode,
            includeMultipleTranslations: true,
            existingPartsOfSpeech,
          },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "Erro ao gerar flashcard")
      }
      const data: FlashcardAIResponse = await res.json()

      const flashcard = aiResponseToFlashcard(data, inputWord, folderId)

      const success = await onAdd(flashcard, { closeAfterAdd: false })
      if (success) {
        if (!pipelineMode) setWord("")
      } else {
        setError("Esta palavra já existe nessa categoria no seu vocabulário.")
      }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao gerar flashcard")
      } finally {
        if (!pipelineMode) setIsLoading(false)
      }
    }

    if (pipelineMode && onPipelineEnqueue) {
      setWord("")
      setSuggestions([])
      setSelectedIdx(-1)
      inputRef.current?.focus()
      onPipelineEnqueue(folderId, 1, run)
      return
    }

    await run()
  }

  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (beforeSubmit && !beforeSubmit()) return

    const words = parseBatchWords(batchText)
    if (words.length === 0) return

    const run = async () => {
      if (!pipelineMode) {
        setIsLoading(true)
        setBatchTotal(words.length)
        setBatchDone(0)
      }
      setError(null)

      const estimateSeconds = Math.max(3, Math.round(words.length * 2.5))
      const t = toast({
      title: "Adição em lote iniciada",
      description: `${words.length} palavra(s) · estimativa ~${estimateSeconds}s`,
    })

      let added = 0
      let skipped = 0
      let failed = 0

      try {
      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        if (!pipelineMode) setBatchDone(i)

        try {
          const existingPartsOfSpeech = await findExistingPartsOfSpeech(w)
          const res = await fetch("/api/ai/flashcard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: w,
              model,
              options: {
                includeSynonymsAntonyms: true,
                synonymsLevel: 3,
                includeConjugations: true,
                includeAlternativeForms,
                includeUsageNote: true,
                includeIpa: true,
                efommMode,
                includeMultipleTranslations: true,
                existingPartsOfSpeech,
              },
            }),
          })
          if (!res.ok) throw new Error("Erro ao gerar")
        const data: FlashcardAIResponse = await res.json()

          const flashcard = aiResponseToFlashcard(data, w, folderId)

          const success = await onAdd(flashcard, { closeAfterAdd: false })
          if (success) added++
          else skipped++
        } catch {
          failed++
        }

        if (!pipelineMode) setBatchDone(i + 1)
        t.update({
          id: t.id,
          title: "Processando lote…",
          description: `${i + 1}/${words.length} · ${w}`,
        })
      }

      t.update({
        id: t.id,
        title: "Lote concluído",
        description: `Adicionados: ${added} · Duplicados: ${skipped} · Falhas: ${failed}`,
      })
        if (!pipelineMode) setBatchText("")
      } finally {
        if (!pipelineMode) {
          setIsLoading(false)
          setBatchTotal(0)
          setBatchDone(0)
        }
      }
    }

    if (pipelineMode && onPipelineEnqueue) {
      setBatchText("")
      onPipelineEnqueue(folderId, words.length, run)
      toast({
        title: "Lote adicionado à fila",
        description: `${words.length} palavra(s) serão processadas em ordem.`,
      })
      return
    }

    await run()
  }

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (beforeSubmit && !beforeSubmit()) return

    const normalizedWord = manualWord.trim().replace(/\s+/g, " ")
    const normalizedTranslation = manualTranslation.trim()
    const normalizedExample = manualExample.trim()
    const normalizedExampleTranslation = manualExampleTranslation.trim()
    const normalizedUsageNote = manualUsageNote.trim()
    const needsCoreEnrichment = !normalizedTranslation || !normalizedExample || !normalizedExampleTranslation
    // Conjugations are stored for every eligible verb. The preference is visual
    // only, so enabling it later never requires a second AI pass.
    const needsConjugationEnrichment = manualPartOfSpeech === "verb" || manualPartOfSpeech === "phrasal-verb"
    const needsBackgroundEnrichment = true

    if (!normalizedWord) {
      triggerSaveFlash("error")
      setError("Preencha a palavra para criar o cartão manual.")
      return
    }

    const run = async () => {
      if (!pipelineMode) setIsLoading(true)
      setError(null)
      let validatedUsageStatus: Flashcard["usageStatus"] = "current"
      let validatedGrammaticalForm: GrammaticalForm = manualGrammaticalForm

    try {
      const posValidationRes = await fetch("/api/ai/validate-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
                word: normalizedWord,
                partOfSpeech: manualPartOfSpeech,
                grammaticalForm: manualGrammaticalForm,
                translation: normalizedTranslation,
          model,
        }),
      })

      if (!posValidationRes.ok) {
        const json = await posValidationRes.json().catch(() => ({}))
        throw new Error(json?.error || "Falha ao validar tag da palavra")
      }

      const posValidation = (await posValidationRes.json()) as {
        valid: boolean
        reason?: string
        usageStatus?: Flashcard["usageStatus"]
        grammaticalForm?: GrammaticalForm
      }

      if (!posValidation.valid) {
        triggerSaveFlash("error")
        setError(
          posValidation.reason
            ? `Tag inválida para "${normalizedWord}": ${posValidation.reason}`
            : `Tag inválida para "${normalizedWord}" em uso comum.`
        )
        if (!pipelineMode) setIsLoading(false)
        return
      }
      validatedUsageStatus = posValidation.usageStatus ?? "current"
      const reviewedGrammaticalForm = normalizeGrammaticalForm(posValidation.grammaticalForm)
      if (reviewedGrammaticalForm !== manualGrammaticalForm) {
        triggerSaveFlash("error")
        setError(
          `Forma gramatical incompatível: você selecionou “${grammaticalFormLabels[manualGrammaticalForm]}”, mas o validador identificou “${grammaticalFormLabels[reviewedGrammaticalForm]}”.`
        )
        if (!pipelineMode) setIsLoading(false)
        return
      }
      validatedGrammaticalForm = manualGrammaticalForm
    } catch (err) {
      triggerSaveFlash("error")
      setError(err instanceof Error ? err.message : "Erro ao validar tag da palavra.")
      if (!pipelineMode) setIsLoading(false)
      return
    }

    const flashcard: Flashcard = {
      id: crypto.randomUUID(),
      word: normalizedWord.toLowerCase(),
      partOfSpeech: manualPartOfSpeech,
      grammaticalForm: validatedGrammaticalForm,
      translation: normalizedTranslation,
      ipa: "",
      usageNote: normalizedUsageNote,
      usageNoteEn: "",
      synonyms: [],
      antonyms: [],
      example: normalizedExample,
      exampleTranslation: normalizedExampleTranslation,
    alternativeForms: [],
    familyKey: normalizeFamilyKey(normalizedWord),
    usageStatus: validatedUsageStatus,
      aiEnriching: needsBackgroundEnrichment,
      folderId,
      createdAt: Date.now(),
    }

    try {
      const success = await onAdd(flashcard, { closeAfterAdd: false })
      if (!success) {
        triggerSaveFlash("error")
        setError("Esta palavra já existe nessa categoria no seu vocabulário.")
        return
      }

      triggerSaveFlash("success")
      toast({
        title: "Cartão manual criado",
        description: `${flashcard.word} (${partOfSpeechLabels[flashcard.partOfSpeech]})`,
      })

      if (needsBackgroundEnrichment && onUpdate) {
        const t = toast({
          title: "IA em segundo plano",
          description: `Completando campos de ${flashcard.word}...`,
        })

        ;(async () => {
          try {
            let aiTranslation = normalizedTranslation
            let aiIpa = ""
            let aiUsageNote = ""
            let aiUsageNoteEn = ""
            let aiExample = normalizedExample
            let aiExampleTranslation = normalizedExampleTranslation
            let aiSynonyms: Flashcard["synonyms"] = []
            let aiAntonyms: Flashcard["antonyms"] = []
            let aiAlternativeForms: Flashcard["alternativeForms"] = []
            let aiConjugations: Flashcard["conjugations"] | undefined
            let aiVerbType: Flashcard["verbType"] | undefined

            const res = await fetch("/api/ai/flashcard", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                word: normalizedWord,
                model,
                options: {
                  includeSynonymsAntonyms: true,
                  synonymsLevel: 3,
                  includeConjugations: true,
                  includeAlternativeForms,
                  includeUsageNote: true,
                  includeIpa: true,
                  efommMode,
                  includeMultipleTranslations: true,
                  targetPartOfSpeech: manualPartOfSpeech,
                },
              }),
            })

            if (!res.ok) {
              const json = await res.json().catch(() => ({}))
              throw new Error(json?.error || "Falha ao enriquecer card manual")
            }

            const data = (await res.json()) as FlashcardAIResponse
            // Keep the generated definition separate from the user-entered
            // value.  The latter is normally authoritative, but a validated
            // archaic/rare sense deliberately replaces a semantically wrong
            // manual translation below.
            aiTranslation = data.translation || normalizedTranslation || ""
            aiIpa = data.ipa || ""
            aiUsageNote = data.usageNote || ""
            aiUsageNoteEn = data.usageNoteEn || ""
            aiExample = data.example || normalizedExample || ""
            aiExampleTranslation = data.exampleTranslation || normalizedExampleTranslation || ""
            aiSynonyms = data.synonyms || []
            aiAntonyms = data.antonyms || []
            aiAlternativeForms = filterArchaicAlternativeForms(
              (data.alternativeForms || []).map((f) => ({
                ...f,
                partOfSpeech: f.partOfSpeech as PartOfSpeech,
              })),
              normalizedWord
            )
            aiConjugations = data.conjugations ?? undefined
            aiVerbType = data.verbType ?? undefined

            if (needsConjugationEnrichment) {
              const conjugationRes = await fetch("/api/ai/flashcard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  word: normalizedWord,
                  model,
                  options: {
                    includeSynonymsAntonyms: false,
                    synonymsLevel: 0,
                    includeConjugations: true,
                    includeAlternativeForms: false,
                    includeUsageNote: false,
                    includeIpa: true,
                    efommMode,
                    includeMultipleTranslations: true,
                    targetPartOfSpeech: manualPartOfSpeech,
                  },
                }),
              })

              if (!conjugationRes.ok) {
                const json = await conjugationRes.json().catch(() => ({}))
                throw new Error(json?.error || "Falha ao gerar conjugação do verbo")
              }

              const conjugationData = (await conjugationRes.json()) as FlashcardAIResponse
              aiConjugations = conjugationData.conjugations ?? aiConjugations
              aiVerbType = conjugationData.verbType ?? aiVerbType
            }

            // A manual definition is normally authoritative. Register-sensitive
            // senses are the exception: an archaic/rare noun must receive the
            // dictionary definition generated for that exact sense, otherwise
            // an adjective translation can silently corrupt the whole card.
            const replaceManualDefinition =
              flashcard.usageStatus === "archaic" ||
              data.usageStatus === "archaic" ||
              data.usageStatus === "rare"
            const enriched: Flashcard = {
              ...flashcard,
              grammaticalForm: flashcard.grammaticalForm ?? normalizeGrammaticalForm(data.grammaticalForm),
              translation: replaceManualDefinition ? (aiTranslation || normalizedTranslation) : (normalizedTranslation || aiTranslation || flashcard.translation),
              ipa: aiIpa || flashcard.ipa || "",
              usageNote: replaceManualDefinition ? (aiUsageNote || normalizedUsageNote) : (normalizedUsageNote || aiUsageNote || flashcard.usageNote || ""),
              usageNoteEn: flashcard.usageNoteEn || aiUsageNoteEn || "",
              example: replaceManualDefinition ? (aiExample || normalizedExample) : (normalizedExample || aiExample || flashcard.example),
              exampleTranslation: replaceManualDefinition ? (aiExampleTranslation || normalizedExampleTranslation) : (normalizedExampleTranslation || aiExampleTranslation || flashcard.exampleTranslation || ""),
              synonyms: aiSynonyms,
              antonyms: aiAntonyms,
              alternativeForms: aiAlternativeForms,
              familyKey: normalizeFamilyKey(data.familyKey || flashcard.familyKey || flashcard.word),
              usageStatus: flashcard.usageStatus === "archaic" ? "archaic" : (data.usageStatus ?? "current"),
              conjugations: aiConjugations ?? flashcard.conjugations,
              verbType: aiVerbType ?? flashcard.verbType,
              aiEnriching: false,
            }

            const updated = await onUpdate(enriched)
            t.update({
              id: t.id,
              title: updated ? "Card enriquecido" : "Card criado",
              description: updated
                ? `Campos ausentes de ${flashcard.word} foram preenchidos pela IA.`
                : `Não foi possível atualizar ${flashcard.word} em segundo plano.`,
              variant: updated ? "default" : "destructive",
            })

            if (updated && includeAlternativeForms && aiAlternativeForms.length > 0) {
              const deck = await readAllFlashcardsFromDB()
              const family = await validateFamilyMembers(
                enriched.word,
                enriched.partOfSpeech,
                getFamilyMembers(enriched.word, deck)
              )
              const canonicalByPOS = new Map<string, Flashcard["alternativeForms"][number]>()
              for (const member of family) {
                for (const d of member.alternativeForms || []) {
                  if (d.partOfSpeech !== enriched.partOfSpeech && !canonicalByPOS.has(d.partOfSpeech)) {
                    canonicalByPOS.set(d.partOfSpeech, d)
                  }
                }
              }
              let currentAlts = [...(enriched.alternativeForms || [])]
              for (const [pos, canonical] of canonicalByPOS) {
                const hasConflict = currentAlts.some((d) => d.partOfSpeech === pos)
                if (hasConflict) {
                  currentAlts = currentAlts.filter((d) => d.partOfSpeech !== pos)
                }
                const alreadyHas = currentAlts.some(
                  (d) => d.word.toLowerCase() === canonical.word.toLowerCase() && d.partOfSpeech === canonical.partOfSpeech
                )
                if (!alreadyHas) {
                  currentAlts = [...currentAlts, canonical]
                }
              }
              currentAlts = filterArchaicAlternativeForms(currentAlts, enriched.word).filter((alt) =>
                !deck.some((card) =>
                  card.word.toLowerCase() === alt.word.toLowerCase() &&
                  card.partOfSpeech === alt.partOfSpeech
                )
              )
              await onUpdate({ ...enriched, alternativeForms: currentAlts })

              for (const alt of currentAlts) {
                const freshDeck2 = await readAllFlashcardsFromDB()
                const family2 = await validateFamilyMembers(
                  enriched.word,
                  enriched.partOfSpeech,
                  getFamilyMembers(enriched.word, freshDeck2)
                )
                for (const member of family2) {
                  if (member.word.toLowerCase() === enriched.word.toLowerCase()) continue
                  const memberAlts = filterArchaicAlternativeForms(member.alternativeForms || [], member.word)
                  const alreadyHasThis = memberAlts.some(
                    (d) => d.word.toLowerCase() === alt.word.toLowerCase() && d.partOfSpeech === alt.partOfSpeech
                  )
                  if (alreadyHasThis) continue
                  const deckHasCard = freshDeck2.some(
                    (f) => f.word.toLowerCase() === alt.word.toLowerCase() && f.partOfSpeech === alt.partOfSpeech
                  )
                  if (deckHasCard) continue
                  const conflictIdx = memberAlts.findIndex((d) => d.partOfSpeech === alt.partOfSpeech)
                  if (conflictIdx >= 0) {
                    const updated = [...memberAlts]
                    updated[conflictIdx] = alt
                    await onUpdate({ ...member, alternativeForms: updated })
                  } else {
                    await onUpdate({ ...member, alternativeForms: [...memberAlts, alt] })
                  }
                }
              }
            }

            if (updated && includeAlternativeForms && enriched.partOfSpeech !== "idiom" && enriched.partOfSpeech !== "phrasal-verb" && enriched.partOfSpeech !== "acronym") {
              try {
                const altRes = await fetch("/api/ai/alternative-pos", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ word: enriched.word, partOfSpeech: enriched.partOfSpeech, model }),
                })
                if (altRes.ok) {
                  const altData = (await altRes.json()) as { alternatives?: Array<{ word: string; partOfSpeech: string; translation: string; example: string; usageNote?: string; usageNoteEn?: string; ipa?: string }> }
                  if (altData.alternatives && altData.alternatives.length > 0) {
                    const freshDeck = await readAllFlashcardsFromDB()
                    const existingAlts = enriched.alternativeForms || []
                    const newAlts = filterArchaicAlternativeForms(
                      altData.alternatives
                        .map((a) => ({ ...a, partOfSpeech: a.partOfSpeech as PartOfSpeech }))
                        .filter((a) => a.translation && a.partOfSpeech && a.partOfSpeech !== enriched.partOfSpeech)
                        .filter((a) => !existingAlts.some((e) => e.word.toLowerCase() === a.word.toLowerCase() && e.partOfSpeech === a.partOfSpeech))
                        .filter((a) => !freshDeck.some((f) => f.word.toLowerCase() === a.word.toLowerCase() && f.partOfSpeech === a.partOfSpeech)),
                      enriched.word
                    )
                    if (newAlts.length > 0) {
                      const mergedAlts = [...existingAlts, ...newAlts]
                      await onUpdate({ ...enriched, alternativeForms: mergedAlts })
                      const deck = await readAllFlashcardsFromDB()
                      const family = await validateFamilyMembers(
                        enriched.word,
                        enriched.partOfSpeech,
                        getFamilyMembers(enriched.word, deck)
                      )
                      for (const alt of mergedAlts) {
                        for (const member of family) {
                          if (member.word.toLowerCase() === enriched.word.toLowerCase()) continue
                          const memberAlts = filterArchaicAlternativeForms(member.alternativeForms || [], member.word)
                          const alreadyHasThis = memberAlts.some(
                            (d) => d.word.toLowerCase() === alt.word.toLowerCase() && d.partOfSpeech === alt.partOfSpeech
                          )
                          if (alreadyHasThis) continue
                          const deckHasCard = deck.some(
                            (f) => f.word.toLowerCase() === alt.word.toLowerCase() && f.partOfSpeech === alt.partOfSpeech
                          )
                          if (deckHasCard) continue
                          const conflictIdx = memberAlts.findIndex((d) => d.partOfSpeech === alt.partOfSpeech)
                          if (conflictIdx >= 0) {
                            const updated = [...memberAlts]
                            updated[conflictIdx] = alt
                            await onUpdate({ ...member, alternativeForms: updated })
                          } else {
                            await onUpdate({ ...member, alternativeForms: [...memberAlts, alt] })
                          }
                        }
                      }
                    }
                  }
                }
              } catch { /* silent */ }
            }
          } catch (err) {
            triggerSaveFlash("error")
            // Clear aiEnriching on failure so card doesn't stay stuck
            try { await onUpdate({ ...flashcard, aiEnriching: false }) } catch { /* ignore */ }
            t.update({
              id: t.id,
              title: "Falha no enriquecimento",
              description: err instanceof Error ? err.message : "Erro ao completar os campos com IA.",
              variant: "destructive",
            })
          }
        })()
      }

      if (!pipelineMode) {
        setManualWord("")
        setManualPartOfSpeech("noun")
        setManualGrammaticalForm("base-form")
        setManualTranslation("")
        setManualExample("")
        setManualExampleTranslation("")
        setManualUsageNote("")
      }
    } finally {
      if (!pipelineMode) setIsLoading(false)
    }
    }

    if (pipelineMode && onPipelineEnqueue) {
      setManualWord("")
      setManualPartOfSpeech("noun")
      setManualGrammaticalForm("base-form")
      setManualTranslation("")
      setManualExample("")
      setManualExampleTranslation("")
      setManualUsageNote("")
      onPipelineEnqueue(folderId, 1, run)
      toast({
        title: "Card manual adicionado à fila",
        description: `${normalizedWord} será processado em ordem.`,
      })
      return
    }

    await run()
  }

  const aiPredictTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiPredictRequestRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    if (aiPredictTimerRef.current) clearTimeout(aiPredictTimerRef.current)
    aiPredictRequestRef.current?.abort()
  }, [])

  const handleWordChange = useCallback((value: string) => {
    setWord(value)
    const q = value.trim().toLowerCase()
    if (aiPredictTimerRef.current) clearTimeout(aiPredictTimerRef.current)
    aiPredictRequestRef.current?.abort()
    if (!q || q.length < 2) { setSuggestions([]); setSelectedIdx(-1); return }

    if (useAiPredictions) {
      const cached = readCachedPredictions(q)
      if (cached) {
        setSuggestions(cached)
        setSelectedIdx(-1)
        return
      }
      setSuggestions([])
      setSelectedIdx(-1)

      aiPredictTimerRef.current = setTimeout(async () => {
        const controller = new AbortController()
        aiPredictRequestRef.current = controller
        try {
          const res = await fetch("/api/ai/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix: q }),
            signal: controller.signal,
          })
          if (res.ok) {
            const data = await res.json() as { suggestions?: string[] }
            const aiSugs = [...new Set((data.suggestions ?? []).filter((w: string) => w && w !== q && w.startsWith(q)))]
            const nextSuggestions = aiSugs.slice(0, 3)
            cachePredictions(q, nextSuggestions)
            setSuggestions(nextSuggestions)
            setSelectedIdx(-1)
          }
        } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]) }
      }, 180)
    } else {
      setSuggestions([])
      setSelectedIdx(-1)
    }
  }, [useAiPredictions])

  const selectSuggestion = useCallback((w: string) => {
    setWord(w)
    setSuggestions([])
    setSelectedIdx(-1)
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      setSelectedIdx((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      setSelectedIdx((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
    } else if (e.key === "Tab") {
      e.preventDefault()
      if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
        selectSuggestion(suggestions[selectedIdx])
      } else {
        setSelectedIdx(0)
      }
    } else if (e.key === "Enter") {
      if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
        e.preventDefault()
        selectSuggestion(suggestions[selectedIdx])
      } else if (word.trim()) {
        setSuggestions([])
        setSelectedIdx(-1)
      }
    } else if (e.key === "Escape") {
      setSuggestions([])
      setSelectedIdx(-1)
    }
  }, [suggestions, selectedIdx, word, selectSuggestion])

  const handleBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setSuggestions([])
      setSelectedIdx(-1)
    }, 150)
  }, [])

  const hasInput = word.trim().length > 0

  const formEl = (
    <form
      onSubmit={mode === "single" ? handleSubmitSingle : mode === "batch" ? handleSubmitBatch : handleSubmitManual}
      className={cn(
        "space-y-0 rounded-2xl transition-all",
        saveFlash === "success" &&
          "bg-emerald-400/10 ring-1 ring-emerald-300/50 animate-[pulse_0.55s_ease-in-out_1]",
        saveFlash === "error" && "bg-rose-300/10 ring-1 ring-rose-300/50 animate-[pulse_0.55s_ease-in-out_1]"
      )}
    >
          {/* Input row */}
          <div className="px-1">
            {mode === "single" ? (
              <Input
                ref={inputRef}
                type="text"
                placeholder={word.length > 0 ? "" : animatedPlaceholder}
                value={word}
                onChange={(e) => handleWordChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onFocus={() => { if (word.trim().length >= 2) handleWordChange(word) }}
                disabled={isLoading}
                className="h-8 w-full border-0 bg-transparent px-0 text-[13px] placeholder:text-[13px] placeholder:text-muted-foreground/40 shadow-none focus-visible:ring-0"
                autoComplete="off"
              />
            ) : mode === "batch" ? (
              <div className="flex h-8 items-center">
                <span className="text-[13px] text-muted-foreground/40 select-none">
                  Batch active — paste words below
                </span>
              </div>
            ) : (
              <div className="flex h-8 items-center">
                <span className="text-[13px] text-muted-foreground/40 select-none">
                  Manual active
                </span>
              </div>
            )}
          </div>

          {/* Bottom row: pills or predictions + button */}
          <div className="flex items-center justify-between px-1 pt-0.5">
            {/* Left: mode pills OR predictions */}
            <div className="flex items-center gap-0.5">
              {/* Mode pills - fade out when typing */}
              <div className={cn(
                "flex items-center gap-1.5 transition-all duration-200",
                hasInput ? "absolute opacity-0 pointer-events-none" : "relative opacity-100"
              )}>
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  disabled={isLoading}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200",
                    mode === "single"
                      ? "bg-foreground/5 text-foreground/80"
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setMode("batch")}
                  disabled={isLoading}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200",
                    mode === "batch"
                      ? "bg-foreground/5 text-foreground/80"
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                >
                  Batch
                </button>
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  disabled={isLoading}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200",
                    mode === "manual"
                      ? "bg-foreground/5 text-foreground/80"
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                >
                  Manual
                </button>
              </div>

              {/* Predictions - same style as pills */}
              <div className={cn(
                "flex items-center gap-0.5 transition-all duration-200",
                hasInput && suggestions.length > 0 ? "relative opacity-100" : "absolute opacity-0 pointer-events-none"
              )}>
                {[...new Set(suggestions)].slice(0, 3).map((s, idx) => (
                  <button
                    key={s}
                    type="button"
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all cursor-pointer",
                      idx === selectedIdx
                        ? "bg-foreground/5 text-foreground/80"
                        : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/5"
                    )}
                    onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s) }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: + button */}
            {mode === "single" ? (
              <Button
                type="submit"
                size="icon"
                disabled={!word.trim() || isLoading}
                className="size-7 shrink-0 rounded-full bg-primary/80 shadow-sm hover:bg-primary hover:shadow-md transition-all"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              </Button>
            ) : mode === "batch" ? (
              <Button
                type="submit"
                size="icon"
                disabled={parseBatchWords(batchText).length === 0 || isLoading}
                className="size-7 shrink-0 rounded-full bg-primary/80 shadow-sm hover:bg-primary hover:shadow-md transition-all"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!manualWord.trim() || isLoading}
                className="size-7 shrink-0 rounded-full bg-primary/80 shadow-sm hover:bg-primary hover:shadow-md transition-all"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              </Button>
            )}
          </div>

          {/* Batch textarea */}
          {mode === "batch" && (
            <div className="mt-3 space-y-2 px-3 pb-3">
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                disabled={isLoading}
                placeholder={"slim\nfreight forwarder, bill of lading\nharbor"}
                className="w-full min-h-[100px] resize-y rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/40"
              />
              <p className="px-1 text-[11px] text-muted-foreground/60">
                {(() => {
                  const count = parseBatchWords(batchText).length
                  if (count === 0) return "Separe por vírgula ou quebra de linha"
                  const est = Math.max(3, Math.round(count * 2.5))
                  return `${count} palavra(s) · ~${est}s estimado`
                })()}
              </p>
              {isLoading && batchTotal > 0 && (
                <div className="space-y-1">
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round((batchDone / batchTotal) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{batchDone}/{batchTotal}</p>
                </div>
              )}
            </div>
          )}

          {mode === "manual" && (
            <div className="mx-3 mb-3 mt-3 space-y-4 rounded-2xl border border-border/50 bg-background/45 p-3.5 shadow-sm sm:p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Word</label>
                  <Input
                    value={manualWord}
                    onChange={(e) => setManualWord(e.target.value)}
                    placeholder="Ex.: agenda"
                    disabled={isLoading}
                    className="h-9 rounded-lg border-border/50 bg-background/70 text-[13px] text-foreground/80 placeholder:text-muted-foreground/45 focus-visible:border-primary/35 focus-visible:ring-primary/15"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Tag</label>
                  <select
                    value={manualPartOfSpeech}
                    onChange={(e) => setManualPartOfSpeech(e.target.value as PartOfSpeech)}
                    disabled={isLoading}
                    className="h-9 w-full rounded-lg border border-border/50 bg-background/70 px-3 text-[13px] text-foreground/80 outline-none transition-colors focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
                  >
                    {(Object.keys(partOfSpeechLabels) as PartOfSpeech[]).map((pos) => (
                      <option key={pos} value={pos}>
                        {partOfSpeechLabels[pos]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Form</label>
                  <select
                    value={manualGrammaticalForm}
                    onChange={(e) => setManualGrammaticalForm(e.target.value as GrammaticalForm)}
                    disabled={isLoading}
                    className="h-9 w-full rounded-lg border border-border/50 bg-background/70 px-3 text-[13px] text-foreground/80 outline-none transition-colors focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
                  >
                    {grammaticalForms.map((form) => (
                      <option key={form} value={form}>
                        {grammaticalFormLabels[form]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Translation</label>
                <Input
                  value={manualTranslation}
                  onChange={(e) => setManualTranslation(e.target.value)}
                  placeholder="Ex.: a pauta / a ordem do dia"
                  disabled={isLoading}
                  className="h-9 rounded-lg border-border/50 bg-background/70 text-[13px] text-foreground/80 placeholder:text-muted-foreground/45 focus-visible:border-primary/35 focus-visible:ring-primary/15"
                />
              </div>

              {showManualOptionalFields && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Example (English) <span className="normal-case tracking-normal text-muted-foreground/55">optional</span></label>
                    <textarea
                      value={manualExample}
                      onChange={(e) => setManualExample(e.target.value)}
                      placeholder="Ex.: The agenda changed after lunch."
                      disabled={isLoading}
                      className="min-h-[72px] w-full resize-y rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-[13px] text-foreground/80 outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Example translation <span className="normal-case tracking-normal text-muted-foreground/55">optional</span></label>
                    <textarea
                      value={manualExampleTranslation}
                      onChange={(e) => setManualExampleTranslation(e.target.value)}
                      placeholder="Ex.: A pauta mudou depois do almoço."
                      disabled={isLoading}
                      className="min-h-[62px] w-full resize-y rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-[13px] text-foreground/80 outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Context <span className="normal-case tracking-normal text-muted-foreground/55">optional</span></label>
                    <textarea
                      value={manualUsageNote}
                      onChange={(e) => setManualUsageNote(e.target.value)}
                      placeholder="Dica de uso, nuance, registro ou contraste que você queira guardar."
                      disabled={isLoading}
                      className="min-h-[62px] w-full resize-y rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-[13px] text-foreground/80 outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1.5 px-4 pb-3 text-[12px] text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {error}
            </p>
          )}
    </form>
  )

  if (bare) return formEl

  return (
    <Card className="surface-card surface-card-elevated overflow-hidden">
      <CardContent className="px-4 py-3">
        {formEl}
      </CardContent>
    </Card>
  )
}
