"use client"

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react"
import { BookOpen, Check, FileText, Folder as FolderIcon, Loader2, RotateCcw, Volume2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReadLabText, ReadLabHighlight, Folder } from "@/lib/types"
import { useFlashcardsDB, readAllFlashcardsFromDB, readAllFoldersFromDB } from "@/hooks/use-flashcards-db"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { useFolder } from "@/components/folder-context"
import { toast } from "@/hooks/use-toast"
import {
  buildNormalizedMap,
  lookupTranslation as lookupInMap,
  extractFocusContext,
} from "@/lib/readlab-lookup"
import { createCardFromAI } from "@/lib/flashcard-create"
import { useReadLabAudio } from "@/hooks/use-readlab-audio"
import { useReadLabPreferences } from "@/hooks/use-readlab-preferences"

const HIGHLIGHT_COLORS = [
  { id: "yellow", color: "bg-yellow-200/60 dark:bg-yellow-400/20", label: "Yellow" },
  { id: "green", color: "bg-emerald-200/60 dark:bg-emerald-400/20", label: "Green" },
  { id: "blue", color: "bg-blue-200/60 dark:bg-blue-400/20", label: "Blue" },
  { id: "pink", color: "bg-pink-200/60 dark:bg-pink-400/20", label: "Pink" },
  { id: "purple", color: "bg-purple-200/60 dark:bg-purple-400/20", label: "Purple" },
]

const highlightColorMap: Record<string, string> = {
  yellow: "bg-yellow-200/60 dark:bg-yellow-400/20",
  green: "bg-emerald-200/60 dark:bg-emerald-400/20",
  blue: "bg-blue-200/60 dark:bg-blue-400/20",
  pink: "bg-pink-200/60 dark:bg-pink-400/20",
  purple: "bg-purple-200/60 dark:bg-purple-400/20",
}

type PopoverStatus = "idle" | "loading" | "ready" | "error" | "added"

interface PopoverState {
  visible: boolean
  x: number
  y: number
  selectedText: string
  translation: string | null
  isJoinedFallback: boolean
  status: PopoverStatus
  isLongSelection: boolean
  contextKey: string
  sourceContext: string
  anchor: { top: number; right: number; bottom: number; left: number } | null
}

const INITIAL_POPOVER: PopoverState = {
  visible: false,
  x: 0,
  y: 0,
  selectedText: "",
  translation: null,
  isJoinedFallback: false,
  status: "idle",
  isLongSelection: false,
  contextKey: "",
  sourceContext: "",
  anchor: null,
}

const CONTEXT_CACHE_VERSION = "v2"

function normalizeSelectionKey(value: string): string {
  return value.toLocaleLowerCase("en-US").trim().replace(/\s+/g, " ")
}

function contextualCacheKey(start: number, end: number, selectedText: string): string {
  return `${CONTEXT_CACHE_VERSION}:${start}:${end}:${normalizeSelectionKey(selectedText)}`
}

function selectionOffsetWithin(root: Node, range: Range, rawSelection: string): number | null {
  if (!root.contains(range.commonAncestorContainer)) return null
  try {
    const prefix = range.cloneRange()
    prefix.selectNodeContents(root)
    prefix.setEnd(range.startContainer, range.startOffset)
    const leadingWhitespace = rawSelection.length - rawSelection.trimStart().length
    return prefix.toString().length + leadingWhitespace
  } catch {
    return null
  }
}

function getWordRangeAtPoint(x: number, y: number): { text: string; range: Range } | null {
  if (typeof document === "undefined") return null
  let range: Range | null = null
  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(x, y)
    if (pos && pos.offsetNode && pos.offsetNode.nodeType === Node.TEXT_NODE) {
      range = document.createRange()
      range.setStart(pos.offsetNode, pos.offset)
      range.setEnd(pos.offsetNode, pos.offset)
    }
  } else if (typeof (document as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range }).caretRangeFromPoint === "function") {
    range = (document as unknown as { caretRangeFromPoint: (x: number, y: number) => Range }).caretRangeFromPoint(x, y)
  }

  if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
    return null
  }

  const node = range.startContainer as Text
  const textContent = node.nodeValue || ""
  let offset = range.startOffset

  const isWordChar = (char: string) => /[\p{L}\p{N}'-]/u.test(char)

  if (offset >= textContent.length && offset > 0) offset = textContent.length - 1
  if (!isWordChar(textContent[offset] || "") && offset > 0 && isWordChar(textContent[offset - 1])) {
    offset--
  }

  if (!isWordChar(textContent[offset] || "")) return null

  let start = offset
  while (start > 0 && isWordChar(textContent[start - 1])) {
    start--
  }

  let end = offset
  while (end < textContent.length && isWordChar(textContent[end])) {
    end++
  }

  const rawWord = textContent.slice(start, end)
  const trimmed = rawWord.replace(/^['-]+|['-]+$/g, "")
  if (trimmed.length < 2) return null

  const wordStart = start + rawWord.indexOf(trimmed)
  const wordEnd = wordStart + trimmed.length

  try {
    const wordRange = document.createRange()
    wordRange.setStart(node, wordStart)
    wordRange.setEnd(node, wordEnd)
    return { text: trimmed, range: wordRange }
  } catch {
    return null
  }
}

// Whether a selection is too long to become a flashcard. The limit is 4 words:
// single words, short phrases, and idiomatic expressions all qualify;
// anything longer (5+ words) or a multi-sentence paragraph is excluded.
function isTooLongForCard(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length > 4
}

function normalizeDeckWord(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
}

function extractSentenceAroundSnippet(fullText: string, snippet: string): string {
  if (!fullText || !snippet) return snippet
  const cleanSnippet = snippet.trim()
  const idx = fullText.indexOf(cleanSnippet)
  if (idx === -1) return snippet

  let start = idx
  while (start > 0) {
    const char = fullText[start - 1]
    if (char === "." || char === "?" || char === "!" || char === "\n") break
    start--
  }

  let end = idx + cleanSnippet.length
  while (end < fullText.length) {
    const char = fullText[end]
    if (char === "." || char === "?" || char === "!" || char === "\n") {
      end++
      break
    }
    end++
  }

  const sentence = fullText.slice(start, end).trim()
  return sentence || snippet
}

function expandSnippetByOneWord(fullText: string, snippet: string): string {
  if (!fullText || !snippet) return snippet
  const cleanSnippet = snippet.trim()
  const idx = fullText.indexOf(cleanSnippet)
  if (idx === -1) return snippet

  const after = fullText.slice(idx + cleanSnippet.length)
  const match = after.match(/^(\s*\S+)/)
  if (match) {
    return (cleanSnippet + match[1]).trim()
  }
  return snippet
}

interface ReadTextViewProps {
  text: ReadLabText
  onUpdateText: (text: ReadLabText) => Promise<boolean>
}

export function ReadTextView({ text, onUpdateText }: ReadTextViewProps) {
  const { addFlashcard, updateFlashcard, allFlashcards } = useFlashcardsDB()
  const { model } = useGptModel()
  const prefs = useAiPreferences()
  const { readTextLayout } = useFolder()
  const contentRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { audioVoice, showRegenerateAudioButton } = useReadLabPreferences()
  const { generate: generateReadLabAudio, statusFor: readLabAudioStatusFor } = useReadLabAudio()

  const [highlights, setHighlights] = useState<ReadLabHighlight[]>(text.highlights || [])
  const [popover, setPopover] = useState<PopoverState>(INITIAL_POPOVER)
  const [mobileSelection, setMobileSelection] = useState<{ text: string; start?: number; end?: number } | null>(null)
  const [showFolderSelector, setShowFolderSelector] = useState(false)
  // Local copy of VocabLab folders, refreshed from IndexedDB every time the
  // folder selector opens. The hook's `folders` from useFlashcardsDB can be
  // stale when ReadLab is opened without first visiting VocabLab.
  const [vocabFolders, setVocabFolders] = useState<Folder[]>([])

  // Load folders directly from IndexedDB when the selector opens so the user
  // always sees the full, up-to-date list even if they came straight to
  // /read without first loading VocabLab.
  useEffect(() => {
    if (!showFolderSelector) return
    let cancelled = false
    readAllFoldersFromDB()
      .then((folders) => {
        if (!cancelled) setVocabFolders(folders)
      })
      .catch(() => {
        if (!cancelled) setVocabFolders([])
      })
    return () => {
      cancelled = true
    }
  }, [showFolderSelector])

  // Keep a working copy of the translation map that we can extend on the fly
  // with results from the on-demand lookup endpoint. Mirrors `text.translationMap`
  // when no patches have been applied yet.
  const [liveMap, setLiveMap] = useState<Record<string, string>>(text.translationMap || {})

  // Re-sync when the user switches texts or the parent persists a new map.
  useEffect(() => {
    setLiveMap(text.translationMap || {})
  }, [text.id, text.translationMap])

  const normalizedMap = useMemo(() => buildNormalizedMap(liveMap), [liveMap])

  // System B translations are scoped to the exact occurrence in the source.
  // This allows the same spelling to keep different meanings in one text and
  // prevents an old global dictionary entry from blocking contextual review.
  const [contextualMap, setContextualMap] = useState<Record<string, string>>(
    text.contextualTranslationMap || {}
  )
  const contextualMapRef = useRef<Record<string, string>>(text.contextualTranslationMap || {})
  useEffect(() => {
    const next = text.contextualTranslationMap || {}
    setContextualMap(next)
    contextualMapRef.current = next
  }, [text.id, text.contextualTranslationMap])

  // Token used to ignore stale on-demand responses (e.g. user selected
  // something else before the previous fetch resolved).
  const lookupTokenRef = useRef(0)
  const selectedDeckCards = useMemo(() => {
    const selected = normalizeDeckWord(popover.selectedText)
    if (!selected) return []
    return allFlashcards.filter((card) => normalizeDeckWord(card.word) === selected)
  }, [allFlashcards, popover.selectedText])

  const runOnDemandLookup = useCallback(
    async (selectedText: string, sourceContext: string, contextKey: string) => {
      const token = ++lookupTokenRef.current
      setPopover((prev) =>
        prev.contextKey === contextKey
          ? { ...prev, status: "loading" }
          : prev
      )
      try {
        const res = await fetch("/api/readlab/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Do NOT send `model` here — the Sistema B model is controlled
          // exclusively by READLAB_LOOKUP_AI_MODEL in .env.local, so the
          // user's header model picker (which is for VocabLab cards) doesn't
          // leak into ReadLab on-demand translations.
          body: JSON.stringify({
            query: selectedText,
            context: sourceContext,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || "lookup failed")
        }
        const data = (await res.json()) as {
          translation: string
          patch: Record<string, string>
        }
        if (token !== lookupTokenRef.current) return

        const translation = data.translation?.trim() || null

        // Persist the reviewed answer under this exact occurrence. Do not
        // merge it into the global word map: "bank" and other polysemes may
        // legitimately need different translations elsewhere in the text.
        if (translation) {
          const nextContextualMap = {
            ...contextualMapRef.current,
            [contextKey]: translation,
          }
          contextualMapRef.current = nextContextualMap
          setContextualMap(nextContextualMap)
          onUpdateText({ ...text, contextualTranslationMap: nextContextualMap }).catch(() => {})
        }

        setPopover((prev) =>
          prev.contextKey === contextKey
            ? {
                ...prev,
                translation: translation ?? prev.translation,
                isJoinedFallback: false,
                status: translation ? "ready" : "error",
              }
            : prev
        )
      } catch {
        if (token !== lookupTokenRef.current) return
        setPopover((prev) =>
          prev.contextKey === contextKey ? { ...prev, status: "error" } : prev
        )
      }
    },
    [text, onUpdateText]
  )

  const processSelection = useCallback(
    (selectedText: string, rect: DOMRect, range: Range | null, isTouch = false) => {
      const rawSelectedText = selectedText
      const cleanText = rawSelectedText.trim()
      if (!cleanText || cleanText.length < 2) return

      const occurrenceStart =
        range && contentRef.current
          ? selectionOffsetWithin(contentRef.current, range, rawSelectedText)
          : null
      const safeOccurrenceStart =
        occurrenceStart !== null
          ? occurrenceStart
          : text.content.toLocaleLowerCase("en-US").indexOf(cleanText.toLocaleLowerCase("en-US"))
      const occurrenceEnd = Math.max(0, safeOccurrenceStart) + cleanText.length
      const contextKey = contextualCacheKey(
        Math.max(0, safeOccurrenceStart),
        occurrenceEnd,
        cleanText
      )
      const sourceContext = extractFocusContext(text.content, cleanText, {
        occurrenceStart: safeOccurrenceStart >= 0 ? safeOccurrenceStart : undefined,
      })
      const contextualTranslation = contextualMap[contextKey]
      const dictionaryResult = lookupInMap(normalizedMap, cleanText)
      const result = contextualTranslation
        ? {
            translation: contextualTranslation,
            isJoinedFallback: false,
            shouldQueryOnDemand: false,
          }
        : {
            ...dictionaryResult,
            isJoinedFallback: Boolean(dictionaryResult.translation),
            shouldQueryOnDemand: true,
          }

      // Wider/taller popover for long selections so paragraph translations fit.
      const isLongSelection =
        cleanText.length > 60 || cleanText.split(/\s+/).length > 8
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const popoverWidth = Math.min(viewportWidth - 16, isLongSelection ? 380 : 280)
      const popoverMaxHeight = Math.min(360, viewportHeight - 32)
      const estimatedHeight = isLongSelection
        ? Math.min(popoverMaxHeight, 220 + cleanText.length / 4)
        : 120

      let x = rect.left + rect.width / 2 - popoverWidth / 2
      let y = rect.top - estimatedHeight - 12

      if (x < 8) x = 8
      if (x + popoverWidth > viewportWidth - 8) x = viewportWidth - popoverWidth - 8
      // Prefer above; flip below only if there's room below but not above.
      const roomAbove = rect.top - 12
      const roomBelow = viewportHeight - rect.bottom - 12
      if (y < 8) {
        if (roomBelow >= estimatedHeight || roomBelow >= roomAbove) {
          y = rect.bottom + 12
        } else {
          y = 16
        }
      }
      if (y + estimatedHeight > viewportHeight - 8) {
        y = Math.max(8, viewportHeight - estimatedHeight - 8)
      }

      const status: PopoverStatus = result.shouldQueryOnDemand ? "loading" : result.translation ? "ready" : "idle"

      if (isTouch) {
        setMobileSelection({
          text: cleanText,
          start: safeOccurrenceStart,
          end: occurrenceEnd,
        })
        // Dismiss native browser selection so Android/iOS floating menu ("Traduzir, Copiar") disappears!
        try {
          window.getSelection()?.removeAllRanges()
        } catch {}
      }

      setPopover({
        visible: true,
        x,
        y,
        selectedText: cleanText,
        translation: result.translation,
        isJoinedFallback: result.isJoinedFallback,
        status,
        isLongSelection,
        contextKey,
        sourceContext,
        anchor: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      })

      if (result.shouldQueryOnDemand) {
        runOnDemandLookup(cleanText, sourceContext, contextKey)
      }
    },
    [contextualMap, normalizedMap, runOnDemandLookup, text.content]
  )

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        return
      }

      const rawSelectedText = selection.toString()
      const selectedText = rawSelectedText.trim()
      if (!selectedText || selectedText.length < 2) {
        return
      }

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      processSelection(rawSelectedText, rect, range, false)
    }, 10)
  }, [processSelection])

  const touchHandledRef = useRef(false)

  // Listen to selectionchange on document so when users drag mobile selection handles,
  // we capture the multi-word selection as soon as they finish dragging the handle.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const handleSelectionChange = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || !selection.rangeCount) return
        const rawSelected = selection.toString()
        const trimmed = rawSelected.trim()
        if (!trimmed || trimmed.split(/\s+/).length < 2) return

        const range = selection.getRangeAt(0)
        if (!contentRef.current || !contentRef.current.contains(range.commonAncestorContainer)) return

        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        touchHandledRef.current = true
        setTimeout(() => { touchHandledRef.current = false }, 400)
        processSelection(rawSelected, rect, range, true)
      }, 350)
    }

    document.addEventListener("selectionchange", handleSelectionChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("selectionchange", handleSelectionChange)
    }
  }, [processSelection])

  const handleTouchEnd = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return
    }
    const rawSelectedText = selection.toString()
    const selectedText = rawSelectedText.trim()
    if (!selectedText || selectedText.length < 2) {
      return
    }
    touchHandledRef.current = true
    setTimeout(() => { touchHandledRef.current = false }, 400)
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    processSelection(rawSelectedText, rect, range, true)
  }, [processSelection])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (touchHandledRef.current) {
        touchHandledRef.current = false
        return
      }
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed && selection.toString().trim().length >= 2) {
        return
      }
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return
      }
      const wordData = getWordRangeAtPoint(e.clientX, e.clientY)
      if (wordData) {
        processSelection(wordData.text, wordData.range.getBoundingClientRect(), wordData.range, true)
      }
    },
    [processSelection]
  )

  const handleSelectWholeSentence = useCallback(() => {
    const snippet = popover.selectedText.trim()
    if (!snippet) return
    const sentence = extractSentenceAroundSnippet(text.content, snippet)
    if (!sentence || sentence === snippet) return

    const anchorRect = popover.anchor
      ? ({
          top: popover.anchor.top,
          right: popover.anchor.right,
          bottom: popover.anchor.bottom,
          left: popover.anchor.left,
          width: popover.anchor.right - popover.anchor.left,
          height: popover.anchor.bottom - popover.anchor.top,
        } as DOMRect)
      : (popoverRef.current?.getBoundingClientRect() ||
          ({
            top: popover.y,
            right: popover.x + 100,
            bottom: popover.y + 30,
            left: popover.x,
            width: 100,
            height: 30,
          } as DOMRect))

    setMobileSelection({ text: sentence })
    processSelection(sentence, anchorRect, null, true)
  }, [popover.anchor, popover.selectedText, popover.x, popover.y, processSelection, text.content])

  const handleExpandOneWord = useCallback(() => {
    const snippet = popover.selectedText.trim()
    if (!snippet) return
    const expanded = expandSnippetByOneWord(text.content, snippet)
    if (!expanded || expanded === snippet) return

    const anchorRect = popover.anchor
      ? ({
          top: popover.anchor.top,
          right: popover.anchor.right,
          bottom: popover.anchor.bottom,
          left: popover.anchor.left,
          width: popover.anchor.right - popover.anchor.left,
          height: popover.anchor.bottom - popover.anchor.top,
        } as DOMRect)
      : (popoverRef.current?.getBoundingClientRect() ||
          ({
            top: popover.y,
            right: popover.x + 100,
            bottom: popover.y + 30,
            left: popover.x,
            width: 100,
            height: 30,
          } as DOMRect))

    setMobileSelection({ text: expanded })
    processSelection(expanded, anchorRect, null, true)
  }, [popover.anchor, popover.selectedText, popover.x, popover.y, processSelection, text.content])

  useLayoutEffect(() => {
    if (!popover.visible || !popover.anchor || !popoverRef.current) return
    const element = popoverRef.current
    element.style.maxHeight = ""
    element.style.overflowY = ""
    const panel = element.getBoundingClientRect()
    const margin = 8
    const gap = 12
    const anchor = popover.anchor
    const roomAbove = anchor.top - margin - gap
    const roomBelow = window.innerHeight - anchor.bottom - margin - gap
    const placeBelow = roomBelow >= panel.height || roomBelow >= roomAbove
    const availableHeight = Math.max(0, placeBelow ? roomBelow : roomAbove)
    const effectiveHeight = Math.min(panel.height, availableHeight)
    if (panel.height > availableHeight) {
      element.style.maxHeight = `${availableHeight}px`
      element.style.overflowY = "auto"
    }
    const idealY = placeBelow ? anchor.bottom + gap : anchor.top - effectiveHeight - gap
    const idealX = (anchor.left + anchor.right) / 2 - panel.width / 2
    const x = Math.min(Math.max(margin, idealX), Math.max(margin, window.innerWidth - panel.width - margin))
    const y = Math.max(margin, idealY)
    if (Math.abs(x - popover.x) > 0.5 || Math.abs(y - popover.y) > 0.5) {
      setPopover((current) => ({ ...current, x, y }))
    }
  }, [popover.visible, popover.anchor, popover.translation, popover.status, popover.isLongSelection, popover.x, popover.y])

  const handleAudio = useCallback(async (regenerate = false) => {
    if (!popover.selectedText) return
    const src = await generateReadLabAudio(popover.selectedText, audioVoice, regenerate)
    if (!src) {
      toast({ title: "Não foi possível gerar o áudio", description: "Tente novamente em instantes.", variant: "destructive" })
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(src)
    audioRef.current = audio
    await audio.play().catch(() => toast({ title: "Não foi possível reproduzir o áudio", variant: "destructive" }))
  }, [audioVoice, generateReadLabAudio, popover.selectedText])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-readlab-popover]") && !target.closest("[data-folder-selector]")) {
        setPopover((prev) => ({ ...prev, visible: false }))
        setMobileSelection(null)
      }
    }

    if (popover.visible) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [popover.visible])

  const handleHighlight = useCallback(
    async (colorId: string) => {
      if (!popover.selectedText) return

      const newHighlight: ReadLabHighlight = {
        id: crypto.randomUUID(),
        text: popover.selectedText,
        color: colorId,
      }

      const updatedHighlights = [...highlights, newHighlight]
      setHighlights(updatedHighlights)
      await onUpdateText({ ...text, highlights: updatedHighlights })

      setMobileSelection(null)
      setPopover((prev) => ({ ...prev, visible: false }))
      window.getSelection()?.removeAllRanges()

      toast({
        title: "Highlight added",
        description: `"${popover.selectedText}" highlighted in ${HIGHLIGHT_COLORS.find((c) => c.id === colorId)?.label}.`,
      })
    },
    [popover.selectedText, highlights, text, onUpdateText]
  )

  const handleRemoveHighlight = useCallback(
    async (highlightId: string) => {
      const updatedHighlights = highlights.filter((h) => h.id !== highlightId)
      setHighlights(updatedHighlights)
      await onUpdateText({ ...text, highlights: updatedHighlights })
    },
    [highlights, text, onUpdateText]
  )

  const findExistingDeckCards = useCallback(async (word: string) => {
    const deck = await readAllFlashcardsFromDB().catch(() => allFlashcards)
    const normalizedWord = normalizeDeckWord(word)
    return deck.filter((card) => normalizeDeckWord(card.word) === normalizedWord)
  }, [allFlashcards])

  const reportExistingDeckCards = useCallback((word: string, existing: typeof allFlashcards) => {
    const categories = [...new Set(existing.map((card) => card.partOfSpeech))].join(", ")
    toast({
      title: "Already in VocabLab",
      description: `“${word}” is already saved${categories ? ` as ${categories}` : ""}. No new AI generation was started.`,
    })
  }, [])

  const handleOpenFolderSelector = useCallback(async () => {
    const selectedText = popover.selectedText.trim()
    if (!selectedText) return
    const existing = await findExistingDeckCards(selectedText)
    if (existing.length) {
      reportExistingDeckCards(selectedText, existing)
      setMobileSelection(null)
      window.getSelection()?.removeAllRanges()
      return
    }
    setShowFolderSelector(true)
  }, [findExistingDeckCards, popover.selectedText, reportExistingDeckCards])

  const handleAddCard = useCallback(
    async (folderId: string | null) => {
      if (!popover.selectedText || !popover.translation) return

      const selectedText = popover.selectedText.trim()

      // Reject only selections longer than 4 words — single words, phrases,
      // and idiomatic expressions are all allowed to become flashcards.
      if (isTooLongForCard(selectedText)) {
        toast({
          title: "Selection too long",
          description: "Pick a single word or a phrase up to 4 words.",
          variant: "destructive",
        })
        setShowFolderSelector(false)
        return
      }

      // Recheck immediately before generation as well. Another tab or synced
      // device may have added the word while the folder selector was open.
      const existing = await findExistingDeckCards(selectedText)
      if (existing.length) {
        setShowFolderSelector(false)
        reportExistingDeckCards(selectedText, existing)
        setMobileSelection(null)
        window.getSelection()?.removeAllRanges()
        return
      }

      // Close the folder selector immediately and dismiss the native text
      // selection so the user is back to reading right away.
      setShowFolderSelector(false)
      window.getSelection()?.removeAllRanges()

      // Show a short "added" confirmation in the popover (green check) before
      // it fades out. Background processing of the card continues while the
      // user keeps reading — no UI blocking.
      setPopover((prev) => ({ ...prev, status: "added" }))

      // Background pipeline: same as VocabLab's AddFlashcardForm. Errors /
      // duplicates are reported via toast without re-opening any UI.
      void createCardFromAI({
        word: selectedText,
        model,
        options: {
          includeSynonymsAntonyms: prefs.includeSynonymsAntonyms,
          synonymsLevel: prefs.synonymsDisplayCount || 3,
          // Keep verb data complete even when the visual section is hidden.
          // This mirrors VocabLab and lets the user reveal conjugations later.
          includeConjugations: true,
          includeAlternativeForms: prefs.includeAlternativeForms,
          includeUsageNote: prefs.includeUsageNote,
          includeIpa: prefs.showIPA,
          efommMode: prefs.efommMode,
          // ReadLab cards always keep a contextual alternative in storage.
          // The VocabLab preference controls only whether the second item is
          // rendered, so switching the toggle later never requires regeneration.
          includeMultipleTranslations: true,
          preferContextualAlternativeTranslation: true,
          preferredTranslation: popover.translation,
          sourceContext: popover.sourceContext || extractFocusContext(text.content, selectedText),
          preserveSourceForm: true,
          conciseSourceExample: true,
        },
        targetFolderId: folderId,
        hooks: {
          addFlashcard,
          updateFlashcard,
          allFlashcards,
        },
      })
        .then((result) => {
          if (result.ok) {
            toast({
              title: "Card added to VocabLab",
              description: `"${result.flashcard.word}"`,
            })
          } else if (result.duplicate) {
            toast({
              title: "Duplicate card",
              description: `"${selectedText}" already has a ${result.flashcard.partOfSpeech} card, and no other common category was found.`,
              variant: "destructive",
            })
          } else {
            toast({
              title: "Failed to create card",
              description: result.error || "Unknown error",
              variant: "destructive",
            })
          }
        })
        .catch(() => {
          toast({
            title: "Failed to create card",
            description: "Unexpected error.",
            variant: "destructive",
          })
        })

      // Auto-close the popover shortly after showing the green check so the
      // user returns to the text. The background work is unaffected.
      window.setTimeout(() => {
        setPopover((prev) => ({ ...prev, visible: false }))
        setMobileSelection(null)
      }, 900)
    },
    [popover.selectedText, popover.translation, popover.sourceContext, addFlashcard, updateFlashcard, allFlashcards, model, prefs, findExistingDeckCards, reportExistingDeckCards, text.content]
  )

  const renderContent = () => {
    const allItems: Array<{ id: string; text: string; color?: string; isMobileSel?: boolean }> = [...highlights]
    if (mobileSelection) {
      allItems.push({
        id: "__mobile_sel__",
        text: mobileSelection.text,
        isMobileSel: true,
      })
    }

    if (allItems.length === 0) {
      return <>{text.content}</>
    }

    const sortedHighlights = allItems
      .map((item) => {
        const idx = text.content.indexOf(item.text)
        return { ...item, idx }
      })
      .filter((item) => item.idx !== -1)
      .sort((a, b) => a.idx - b.idx)

    if (sortedHighlights.length === 0) {
      return <>{text.content}</>
    }

    const parts: ReactNode[] = []
    let lastIndex = 0

    for (const item of sortedHighlights) {
      const idx = text.content.indexOf(item.text, lastIndex)
      if (idx === -1) continue

      if (idx > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.content.slice(lastIndex, idx)}
          </span>
        )
      }

      if (item.isMobileSel) {
        parts.push(
          <span
            key="mobile-sel"
            className="rounded bg-primary/20 text-foreground px-0.5 ring-1 ring-primary/40"
          >
            {item.text}
          </span>
        )
      } else {
        const colorClass = highlightColorMap[item.color || "yellow"] || highlightColorMap.yellow
        parts.push(
          <span
            key={item.id}
            className={cn("relative cursor-pointer group/highlight rounded px-0.5", colorClass)}
            onClick={(e) => {
              e.stopPropagation()
              handleRemoveHighlight(item.id)
            }}
            title="Click to remove highlight"
          >
            {item.text}
            <span className="absolute -top-1 -right-1 hidden group-hover/highlight:flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <X className="size-2.5" />
            </span>
          </span>
        )
      }

      lastIndex = idx + item.text.length
    }

    if (lastIndex < text.content.length) {
      parts.push(
        <span key={`text-end`}>
          {text.content.slice(lastIndex)}
        </span>
      )
    }

    return <>{parts}</>
  }

  return (
    <div className={cn("w-full transition-[width] duration-200", readTextLayout === "focused" && "md:w-1/2 md:mr-auto")}>
      {/* Header — back arrow + delete live outside (in the parent toolbar).
          Here we only show the title and the word/highlight counters. */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="line-clamp-2 break-words text-lg font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{text.title}</h2>
          <p className="text-[12px] text-muted-foreground/60">
            {text.content.split(/\s+/).filter(Boolean).length} words · {highlights.length} highlights
          </p>
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className={cn(
          "prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-[1.8] text-foreground/85 whitespace-pre-wrap select-text",
          readTextLayout !== "original" && "text-justify"
        )}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        {renderContent()}
      </div>

      {/* Floating Popover */}
      {popover.visible && (
        <div
          ref={popoverRef}
          data-readlab-popover
          className="fixed z-50 animate-in fade-in zoom-in-95 duration-150 scrollbar-hide"
          style={{
            left: popover.x,
            top: popover.y,
            width: popover.isLongSelection ? "min(92vw, 380px)" : "min(88vw, 280px)",
            maxWidth: "calc(100vw - 16px)",
          }}
        >
          <div className="relative rounded-xl border border-border/50 bg-background/95 p-3 shadow-lg backdrop-blur-sm w-full">
            {/* Close button (top-right corner) */}
            <button
              type="button"
              onClick={() => {
                setPopover((prev) => ({ ...prev, visible: false }))
                setMobileSelection(null)
                window.getSelection()?.removeAllRanges()
              }}
              className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>

            {/* Selected text */}
            <div className="mb-1.5 line-clamp-3 pr-6 whitespace-pre-wrap text-[13px] font-medium text-foreground/80">
              &ldquo;{popover.selectedText}&rdquo;
            </div>

            {/* Quick sentence/phrase expansion chips */}
            <div className="mb-2.5 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleSelectWholeSentence}
                className="inline-flex items-center gap-1 rounded-md bg-muted/70 hover:bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Selecionar e traduzir toda a frase ao redor"
              >
                <FileText className="size-3" />
                <span>Frase toda</span>
              </button>
              <button
                type="button"
                onClick={handleExpandOneWord}
                className="inline-flex items-center gap-0.5 rounded-md bg-muted/70 hover:bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Adicionar próxima palavra à seleção"
              >
                <span>+1 palavra</span>
              </button>
            </div>

            {/* Translation */}
            {popover.status === "loading" && !popover.translation && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Consultando IA...</span>
              </div>
            )}
            {popover.status === "added" ? (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-3 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-4 animate-in zoom-in-100 duration-200" />
                <span>Card enviado ao VocabLab...</span>
              </div>
            ) : (
              popover.translation && (
                <div
                  className={cn(
                    "context-bubble mb-3 rounded-lg bg-primary/5 px-3 py-2 text-[13px] text-primary whitespace-pre-wrap",
                    "max-h-[50vh] overflow-y-auto scrollbar-hide",
                    popover.isJoinedFallback && popover.status !== "ready" &&
                      "opacity-70 italic"
                  )}
                  title={
                    popover.isJoinedFallback && popover.status !== "ready"
                      ? "Traducao montada palavra por palavra — aguarde a IA para uma versao melhor."
                      : undefined
                  }
                >
                  {popover.translation}
                </div>
              )
            )}
            {popover.status === "error" && !popover.translation && (
              <div className="mb-3 rounded-lg bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                Nao foi possivel traduzir agora. Tente novamente.
              </div>
            )}

            {/* Actions row (hidden while the "added" check is showing) */}
            {popover.status !== "added" && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAudio(false)}
                  disabled={readLabAudioStatusFor(popover.selectedText, audioVoice) === "loading"}
                  className="flex size-8 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors hover:bg-primary/14 disabled:opacity-60"
                  title="Ouvir seleção"
                  aria-label="Ouvir seleção"
                >
                  {readLabAudioStatusFor(popover.selectedText, audioVoice) === "loading"
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <Volume2 className="size-3.5" />}
                </button>
                {showRegenerateAudioButton && readLabAudioStatusFor(popover.selectedText, audioVoice) === "ready" && (
                  <button
                    type="button"
                    onClick={() => handleAudio(true)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Regenerar áudio"
                    aria-label="Regenerar áudio"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                )}
                {/* Add Card button — show for selections up to 4 words.
                    Single words, phrases, and idiomatic expressions qualify. */}
                {popover.translation &&
                  popover.status !== "loading" &&
                  !isTooLongForCard(popover.selectedText) && (
                  selectedDeckCards.length ? (
                    <span className="flex h-8 items-center gap-1.5 rounded-lg bg-muted px-3 text-[12px] font-medium text-muted-foreground" title={`Already saved as ${[...new Set(selectedDeckCards.map((card) => card.partOfSpeech))].join(", ")}`}>
                      <Check className="size-3.5" />In VocabLab
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleOpenFolderSelector()}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 text-[12px] font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/15"
                    >
                      <BookOpen className="size-3.5" />
                      Add Card
                    </button>
                  )
                )}
              </div>
            )}

            {/* Highlight color dots (hidden during "added" confirmation) */}
            {popover.status !== "added" && (
              <div className="mt-2 flex gap-1 border-t border-border/30 pt-2">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleHighlight(c.id)}
                  className={cn("size-5 rounded-full transition-transform hover:scale-110", c.color)}
                  title={c.label}
                />
              ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Folder Selector Dialog */}
      {showFolderSelector && (
        <div
          data-folder-selector
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowFolderSelector(false)}
        >
          <div
            className="w-[90vw] max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-foreground mb-1">Save card to</h3>
            <p className="text-[12px] text-muted-foreground/60 mb-4">
              Choose a VocabLab folder for &ldquo;{popover.selectedText}&rdquo;
            </p>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {/* General only exists visually when it contains unfiled cards. */}
              {allFlashcards.some((card) => !card.folderId) && <button
                type="button"
                onClick={() => handleAddCard(null)}
                className="flex w-full items-center gap-2 rounded-xl border border-border/30 px-4 py-3 text-left text-[13px] transition-colors hover:border-primary/20 hover:bg-primary/5"
              >
                <FolderIcon className="size-4 text-muted-foreground/60" />
                <span className="font-medium">General</span>
              </button>}

              {/* User folders */}
              {vocabFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleAddCard(folder.id)}
                  className="flex w-full items-center gap-2 rounded-xl border border-border/30 px-4 py-3 text-left text-[13px] transition-colors hover:border-primary/20 hover:bg-primary/5"
                >
                  <FolderIcon className="size-4 text-primary/60" />
                  <span className="font-medium">{folder.name}</span>
                </button>
              ))}

              {vocabFolders.length === 0 && !allFlashcards.some((card) => !card.folderId) && (
                <p className="text-[12px] text-muted-foreground/60 text-center py-2">
                  No VocabLab folders available. Create one in VocabLab first.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFolderSelector(false)}
              className="mt-4 w-full rounded-xl border border-border/30 py-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
