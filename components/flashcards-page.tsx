"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Loader2, FolderPlus, Folder, FolderOpen, GraduationCap, TrendingUp, Target, Calendar, CalendarDays, Timer, Layers3, Flame, LayoutGrid, List, LayoutPanelTop, MoreVertical, Trash2, BookMarked, Pencil, Plus, BarChart2, X, XCircle, Search, Tag, Settings, FileUp, FileText, CheckCircle2, ArrowRightLeft } from "lucide-react"
import { useFlashcardsDB, readAllFlashcardsFromDB } from "@/hooks/use-flashcards-db"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { useCardShape } from "@/hooks/use-card-shape"
import { partOfSpeechLabels } from "@/lib/constants"
import { AddFlashcardForm } from "./add-flashcard-form"
import { FlashcardCard } from "./flashcard-card"
import { StudyMode } from "./study-mode"
import { VocabularyChoiceMode } from "./vocabulary-choice-mode"

import { WritingMode } from "./writing-mode"
import { FolderCard, NewFolderCard } from "./folder-card"
import { FolderTransferDialog } from "./folder-transfer-dialog"
import { FolderManagerPanel } from "./folder-manager-panel"
import { FolderDeleteChoice, FolderDeleteOptions } from "./folder-delete-dialog"
import { LongPressButton } from "./long-press-button"
import { useFolder } from "./folder-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { normalizeGrammaticalForm } from "@/lib/grammatical-forms"
import { reviewFolderTitle } from "@/lib/review-folder-title"
import { VOCAB_DEFAULT_FOLDER_NAME } from "@/lib/vocab-default-catalog"
import { VOCAB_IDIOMS_FOLDER_NAME } from "@/lib/vocab-idioms-catalog"
import { toast } from "@/hooks/use-toast"
import type { Flashcard, FlashcardAIResponse, PartOfSpeech } from "@/lib/types"

const VOCAB_CURATED_FOLDER_NAMES = [
  VOCAB_DEFAULT_FOLDER_NAME,
  VOCAB_IDIOMS_FOLDER_NAME,
] as const

const visibleChoiceTranslation = (value: string, includeMultipleTranslations: boolean) =>
  includeMultipleTranslations
    ? value.trim()
    : value.split("/").map((item) => item.trim()).filter(Boolean)[0] || value.trim()

const canUseVocabularyMultipleChoice = (cards: Flashcard[], includeMultipleTranslations: boolean) =>
  cards.length >= 10 && new Set(cards.map((card) => visibleChoiceTranslation(card.translation, includeMultipleTranslations).toLocaleLowerCase("pt-BR")).filter(Boolean)).size >= 4

const tagTextColor: Record<PartOfSpeech, string> = {
  verb: "text-blue-600 dark:text-blue-400", "phrasal-verb": "text-sky-600 dark:text-sky-400", noun: "text-emerald-600 dark:text-emerald-400", adjective: "text-amber-600 dark:text-amber-400", adverb: "text-purple-600 dark:text-purple-400", preposition: "text-rose-600 dark:text-rose-400", conjunction: "text-cyan-600 dark:text-cyan-400", interjection: "text-orange-600 dark:text-orange-400", acronym: "text-indigo-600 dark:text-indigo-400", idiom: "text-pink-600 dark:text-pink-400",
}
import {
  getFamilyMembers,
  filterAlternativesByDeck,
  propagateDerivationToFamily,
  validateFamilyMembers,
  filterArchaicAlternativeForms,
  normalizeFamilyKey,
} from "@/lib/flashcard-create"

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}

// This is the final client-side persistence guard for cards created by
// clicking a derivation. The API already normalizes this, but a malformed
// provider response must never let a third equivalent enter IndexedDB.
function limitGeneratedTranslation(value: string, includeMultipleTranslations: boolean): string {
  const chunks = String(value ?? "")
    .replace(/\s*;\s*/g, " / ")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.toLocaleLowerCase("pt-BR") === item.toLocaleLowerCase("pt-BR")) === index)

  if (chunks.length === 0) return ""
  return includeMultipleTranslations ? chunks.slice(0, 2).join(" / ") : chunks[0]
}

type QuizletImportEntry = { word: string; translation: string }
type QuizletTranslationReview = {
  verdict: "accepted" | "corrected" | "unverified"
  translation: string
  reason: string
}
type EditableQuizletImportEntry = QuizletImportEntry & {
  id: string
  selected: boolean
  originalTranslation?: string
  review: QuizletTranslationReview
}
const QUIZLET_PDF_MAX_PAGES = 30

// Quizlet exports often use commas as separators, while VocabLab presents
// alternate translations with "/". Only split at the top level so a note
// such as "entrar (em carro, táxi, etc.)" keeps its natural punctuation.
function normalizeImportedTranslation(value: string): string {
  const parts: string[] = []
  let current = ""
  let nesting = 0

  const flush = () => {
    const item = current.trim().replace(/\s+/g, " ")
    if (item) parts.push(item)
    current = ""
  }

  for (const character of String(value ?? "")) {
    if (character === "(" || character === "[" || character === "{") nesting += 1
    if (character === ")" || character === "]" || character === "}") nesting = Math.max(0, nesting - 1)

    if (nesting === 0 && (character === "," || character === ";" || character === "/")) {
      flush()
      continue
    }
    current += character
  }
  flush()

  return parts
    .filter((item, index, items) => items.findIndex((candidate) => candidate.toLocaleLowerCase("pt-BR") === item.toLocaleLowerCase("pt-BR")) === index)
    .join(" / ")
}

async function renderQuizletPdfPages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  ).toString()
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, QUIZLET_PDF_MAX_PAGES); pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(1.7, 1800 / Math.max(baseViewport.width, 1))
    const viewport = page.getViewport({ scale })
    const canvas = window.document.createElement("canvas")
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not prepare the PDF page for reading.")
    await page.render({ canvas, canvasContext: context, viewport }).promise
    pages.push(canvas.toDataURL("image/jpeg", 0.86))
  }

  return pages
}

export function FlashcardsPage() {
  const { squareCards } = useCardShape()
  const { 
    flashcards,
    allFlashcards,
    folders,
    reviewFlashcards,
    selectedFolderId,
    setSelectedFolderId,
    isLoading, 
    addFlashcard, 
    deleteFlashcard,
    updateFlashcard,
    addFolder,
    deleteFolder,
    renameFolder,
    addToReviewFolder,
    removeFromReviewFolder,
    recordStudyResult,
  } = useFlashcardsDB()
  
  const { getStudyStats, isLoaded: isProgressLoaded } = useGrammarProgress()
  const studyStats = getStudyStats()
  const masteredCards = allFlashcards.filter((card) => (card.studyStreak ?? 0) >= 3).length
  const deckCoverage = allFlashcards.length > 0 ? Math.round((masteredCards / allFlashcards.length) * 100) : 0
  const { model } = useGptModel()
  const { setIsInsideFolder, setGoBack, layout, setLayout, setOnShowStats } = useFolder()
  const {
    includeSynonymsAntonyms,
    synonymsDisplayCount,
    includeConjugations,
    includeAlternativeForms,
    showContext,
    showIPA,
    efommMode,
    includeMultipleTranslations,
  } = useAiPreferences()

  const [newFolderName, setNewFolderName] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isStudying, setIsStudying] = useState(false)
  const [isChoiceMode, setIsChoiceMode] = useState(false)
  const [isWritingMode, setIsWritingMode] = useState(false)
  const [writingModeCards, setWritingModeCards] = useState<Flashcard[]>([])
  const [isReviewStudy, setIsReviewStudy] = useState(false)
  const [isReviewFolderSelected, setIsReviewFolderSelected] = useState(false)
  const [selectedReviewFolderId, setSelectedReviewFolderId] = useState<string | null>(null)
  const [showStudySelector, setShowStudySelector] = useState(false)
  const [showReviewStudySelector, setShowReviewStudySelector] = useState(false)
  const [studyCards, setStudyCards] = useState<Flashcard[] | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [pipelineByFolder, setPipelineByFolder] = useState<Record<string, number>>({})
  const pipelineTailRef = useRef<Promise<void>>(Promise.resolve())
  const [showQuizletImport, setShowQuizletImport] = useState(false)
  const [quizletPdf, setQuizletPdf] = useState<File | null>(null)
  const [quizletEntries, setQuizletEntries] = useState<EditableQuizletImportEntry[]>([])
  const [quizletImportError, setQuizletImportError] = useState<string | null>(null)
  const [isReadingQuizletPdf, setIsReadingQuizletPdf] = useState(false)
  const [quizletDestination, setQuizletDestination] = useState("__general__")
  const [quizletNewFolderName, setQuizletNewFolderName] = useState("")

  const enqueueHomePipeline = useCallback((folderId: string | null, itemCount: number, job: () => Promise<void>) => {
    const key = folderId ?? "__general__"
    setPipelineByFolder((current) => ({
      ...current,
      [key]: (current[key] ?? 0) + itemCount,
    }))

    pipelineTailRef.current = pipelineTailRef.current
      .catch(() => undefined)
      .then(job)
      .catch((error) => {
        toast({
          title: "Falha na fila de criação",
          description: error instanceof Error ? error.message : "Não foi possível processar um item da fila.",
          variant: "destructive",
        })
      })
      .finally(() => {
        setPipelineByFolder((current) => {
          const remaining = Math.max(0, (current[key] ?? 0) - itemCount)
          if (remaining === 0) {
            const { [key]: _completed, ...rest } = current
            return rest
          }
          return { ...current, [key]: remaining }
        })
      })
  }, [])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTag, setSelectedTag] = useState<PartOfSpeech | "all">("all")
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [isRenamingFolder, setIsRenamingFolder] = useState(false)
  const [isViewingGeneral, setIsViewingGeneral] = useState(false)
  const [addDestinationFolderId, setAddDestinationFolderId] = useState<string | null>(null)
  const [generalFolderName, setGeneralFolderName] = useState("General")
  const [folderColors, setFolderColors] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vocablab_folder_colors")
      return saved ? JSON.parse(saved) : {}
    }
    return {}
  })
  const [deleteTargetFolderId, setDeleteTargetFolderId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditingReviewFolder, setIsEditingReviewFolder] = useState(false)
  const [transferTrayOpen, setTransferTrayOpen] = useState(false)
  const [transferTag, setTransferTag] = useState<PartOfSpeech | "all">("all")
  const [transferMode, setTransferMode] = useState<"all" | "tag" | "selected" | "streak">("all")
  const [transferSelectedIds, setTransferSelectedIds] = useState<Set<string>>(new Set())
  const [transferStreak, setTransferStreak] = useState(0)
  const [transferDestination, setTransferDestination] = useState("")
  const [transferNewFolderName, setTransferNewFolderName] = useState("")
  const [transferBusy, setTransferBusy] = useState(false)

  // Load custom General folder name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem("vocablab_general_folder_name")
    if (savedName) setGeneralFolderName(savedName)
  }, [])

  useEffect(() => {
    const refreshFolderColors = () => {
      try {
        const saved = localStorage.getItem("vocablab_folder_colors")
        setFolderColors(saved ? JSON.parse(saved) : {})
      } catch {
        setFolderColors({})
      }
    }
    window.addEventListener("vocablab-folder-colors-updated", refreshFolderColors)
    return () => window.removeEventListener("vocablab-folder-colors-updated", refreshFolderColors)
  }, [])

  const updateFolderColor = (folderId: string, color: string) => {
    const newColors = { ...folderColors, [folderId]: color }
    setFolderColors(newColors)
    localStorage.setItem("vocablab_folder_colors", JSON.stringify(newColors))
  }

  const getFolderGradient = (folderId: string, index: number): "default" | "violet" | "emerald" | "amber" | "rose" => {
    const color = folderColors[folderId]
    if (color) return color as "default" | "violet" | "emerald" | "amber" | "rose"
    return "default"
  }

  useEffect(() => {
    if (isReviewFolderSelected && reviewFlashcards.length === 0) {
      setIsWritingMode(false)
      setIsReviewFolderSelected(false)
      setIsReviewStudy(false)
      setStudyCards(null)
      setWritingModeCards([])
    }
  }, [isReviewFolderSelected, reviewFlashcards.length])

  useEffect(() => {
    if (addDestinationFolderId && addDestinationFolderId !== "__general__" && !folders.some((folder) => folder.id === addDestinationFolderId)) {
      setAddDestinationFolderId(null)
    }
  }, [addDestinationFolderId, folders])

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setIsCreatingFolder(true)
    await addFolder(newFolderName)
    setNewFolderName("")
    setIsDialogOpen(false)
    setIsCreatingFolder(false)
  }

  const handleRenameFolder = async () => {
    if (!editingFolderName.trim()) return
    setIsRenamingFolder(true)

    if (editingFolderId === null) {
      // General folder - store custom name in localStorage and update state
      const newName = editingFolderName.trim()
      localStorage.setItem("vocablab_general_folder_name", newName)
      setGeneralFolderName(newName)
      setIsRenameDialogOpen(false)
      setIsRenamingFolder(false)
      toast({
        title: "Folder renamed",
        description: `Folder renamed to "${newName}".`,
      })
    } else {
      const success = await renameFolder(editingFolderId, editingFolderName)
      setIsRenameDialogOpen(false)
      setIsRenamingFolder(false)
      if (success) {
        toast({
          title: "Folder renamed",
          description: `Folder renamed to "${editingFolderName}".`,
        })
      } else {
        toast({
          title: "Error",
          description: "Could not rename folder.",
          variant: "destructive",
        })
      }
    }
  }

  const handleDeleteGeneralFolder = async () => {
    // Delete all cards without folderId
    const cardsToDelete = flashcards.filter((f) => !f.folderId)
    for (const card of cardsToDelete) {
      await deleteFlashcard(card.id)
    }
    setIsRenameDialogOpen(false)
    toast({
      title: "General folder cleared",
      description: `${cardsToDelete.length} ${cardsToDelete.length === 1 ? "card removed" : "cards removed"} from General folder.`,
    })
  }

  const clearReviewFolderByParent = async (parentFolderId: string) => {
    const cardsToClear = allFlashcards.filter((card) => (
      card.isReviewFolder && (card.folderId ?? "__general__") === parentFolderId
    ))
    if (cardsToClear.length === 0) return 0

    const results = await Promise.all(cardsToClear.map((card) => removeFromReviewFolder(card.id)))
    return results.filter(Boolean).length
  }

  const handleDeleteDisplayedFlashcard = async (id: string) => {
    if (isReviewFolderSelected) {
      const removed = await removeFromReviewFolder(id)
      if (removed) {
        toast({ title: "Removed from Review", description: "The original card remains in its folder." })
      }
      return removed
    }
    return deleteFlashcard(id)
  }

  const transferWithRules = async () => {
    if (isEditingReviewFolder || transferBusy) return
    const sourceCards = flashcards.filter((card) => {
      if (card.folderId !== editingFolderId || card.isReviewFolder) return false
      if (transferMode === "selected") return transferSelectedIds.has(card.id)
      return (transferTag === "all" || card.partOfSpeech === transferTag) && (transferStreak === 0 || (card.studyStreak ?? 0) >= transferStreak)
    })
    if (sourceCards.length === 0) {
      toast({ title: "No matching cards", description: "Adjust the tag filter or choose another source folder." })
      return
    }
    setTransferBusy(true)
    try {
      let destinationId = transferDestination
      let destinationName = folders.find((folder) => folder.id === destinationId)?.name ?? generalFolderName
      if (destinationId === "__new__") {
        const created = await addFolder(transferNewFolderName.trim())
        if (!created) throw new Error("Could not create the destination folder.")
        destinationId = created.id
        destinationName = created.name
      }
      if (!destinationId || destinationId === String(editingFolderId ?? "__general__")) {
        throw new Error("Choose a different destination folder.")
      }
      const targetFolderId = destinationId === "__general__" ? null : destinationId
      const results = await Promise.all(sourceCards.map((card) => updateFlashcard({ ...card, folderId: targetFolderId })))
      if (results.some((result) => !result)) throw new Error("One or more cards could not be moved.")
      toast({ title: "Cards transferred", description: `${sourceCards.length} card${sourceCards.length === 1 ? "" : "s"} moved to \"${destinationName}\".` })
      setTransferTrayOpen(false)
      setTransferTag("all")
      setTransferStreak(0)
      setTransferDestination("")
      setTransferNewFolderName("")
    } catch (error) {
      toast({ title: "Transfer failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" })
    } finally {
      setTransferBusy(false)
    }
  }
  const transferSelectedCards = async (ids: string[], targetFolderId: string) => {
    const results = await Promise.all(ids.map((id) => { const card = flashcards.find((item) => item.id === id); return card ? updateFlashcard({ ...card, folderId: targetFolderId }) : Promise.resolve(false) }))
    return results.every(Boolean)
  }

  const handleDeleteFolderWithMigration = async (folderId: string | null, targetFolderId: string | null) => {
    if (isEditingReviewFolder && selectedReviewFolderId) {
      const removedCount = await clearReviewFolderByParent(selectedReviewFolderId)
      setIsRenameDialogOpen(false)
      setShowDeleteConfirm(false)
      setDeleteTargetFolderId(null)
      toast({
        title: "Review folder deleted",
        description: removedCount > 0
          ? `${removedCount} cards were removed from Review. The original cards were preserved.`
          : "The Review folder was already empty.",
      })
      return
    }

    if (folderId === null) {
      // General folder - can't delete, just clear
      await handleDeleteGeneralFolder()
      return
    }

    // Move cards to the selected destination, or permanently delete them.
    const cardsToMove = flashcards.filter(f => f.folderId === folderId)
    const shouldDeleteCards = targetFolderId === "__delete__"
    const destinationFolderId = !targetFolderId || targetFolderId === "__general__" ? null : targetFolderId
    let cardsHandled = true
    if (!shouldDeleteCards) {
      for (const card of cardsToMove) {
        if (!await updateFlashcard({ ...card, folderId: destinationFolderId })) cardsHandled = false
      }
    } else {
      for (const card of cardsToMove) {
        if (!await deleteFlashcard(card.id)) cardsHandled = false
      }
    }
    if (!cardsHandled) {
      toast({ title: "Folder preserved", description: "Some cards could not be processed. Try again.", variant: "destructive" })
      return
    }

    // Delete the folder
    if (!await deleteFolder(folderId)) {
      toast({ title: "Could not delete folder", description: "The cards were processed, but the folder remains.", variant: "destructive" })
      return
    }
    
    const folderName = folders.find(f => f.id === folderId)?.name || "Unknown"
    const targetName = shouldDeleteCards
      ? null
      : destinationFolderId
        ? folders.find(f => f.id === destinationFolderId)?.name || "Unknown"
        : generalFolderName
    
    setIsRenameDialogOpen(false)
    setShowDeleteConfirm(false)
    setDeleteTargetFolderId(null)
    
    toast({
      title: "Folder deleted",
      description: targetName
        ? `"${folderName}" deleted. ${cardsToMove.length} cards moved to "${targetName}".`
        : `"${folderName}" and ${cardsToMove.length} cards deleted.`,
    })
  }

  const selectedFolder = folders.find(f => f.id === selectedFolderId)
  
  // Compute review folders grouped by folderId
  const reviewFoldersByParent = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const card of flashcards) {
      if (card.isReviewFolder) {
        const parentFolderId = card.folderId || "__general__"
        grouped[parentFolderId] = (grouped[parentFolderId] || 0) + 1
      }
    }
    return grouped
  }, [flashcards])

  const studyFolderName = isReviewFolderSelected 
    ? (selectedReviewFolderId 
      ? reviewFolderTitle(
          folders.find(f => f.id === selectedReviewFolderId)?.name || generalFolderName,
          VOCAB_CURATED_FOLDER_NAMES,
        )
      : "Review")
    : (selectedFolder?.name ?? "All words")
  
  const effectiveStudyCards = studyCards ?? flashcards
  const inputFolderId = addDestinationFolderId === "__general__"
    ? null
    : addDestinationFolderId ?? selectedFolderId
  const pipelineCountForFolder = (folderId: string | null) => pipelineByFolder[folderId ?? "__general__"] ?? 0
  const pipelineSubtitle = (folderId: string | null, wordCount: number) => {
    const queued = pipelineCountForFolder(folderId)
    return queued > 0
      ? `Processing ${queued} ${queued === 1 ? "card" : "cards"} · ${wordCount} saved`
      : undefined
  }
  const activeFolderPipelineCount = pipelineCountForFolder(selectedFolderId)
  const selectAddDestination = (folderId: string, folderName: string) => {
    if (addDestinationFolderId === folderId) {
      setAddDestinationFolderId(null)
      toast({
        title: "Folder selection cleared",
        description: "Select another folder before generating words from the home screen.",
      })
      return
    }
    setAddDestinationFolderId(folderId)
    toast({
      title: "Folder selected",
      description: `New words will be added to "${folderName}".`,
    })
  }
  const requireHomeDestination = () => {
    if (addDestinationFolderId && folders.some((folder) => folder.id === addDestinationFolderId)) return true
    toast({
      title: "Selecione uma pasta",
      description: "Na tela principal, clique com o botão direito em uma pasta antes de gerar uma palavra.",
      variant: "destructive",
    })
    return false
  }
  
  const displayedFlashcards = isReviewFolderSelected
    ? selectedReviewFolderId
      ? selectedReviewFolderId === "__general__"
        ? flashcards.filter(f => f.isReviewFolder && !f.folderId)
        : flashcards.filter(f => f.isReviewFolder && f.folderId === selectedReviewFolderId)
      : reviewFlashcards
    : isViewingGeneral 
    ? flashcards.filter((f) => !f.folderId)
    : selectedFolderId 
    ? flashcards.filter((f) => f.folderId === selectedFolderId)
    : flashcards
  
  const visibleReviewWords = studyStats.wordsToReview

  const normalizedSearch = useMemo(
    () => normalizeForSearch(searchQuery.trim()),
    [searchQuery]
  )

  const filteredFlashcards = useMemo(() => {
    const byTag = selectedTag === "all"
      ? displayedFlashcards
      : displayedFlashcards.filter((flashcard) => flashcard.partOfSpeech === selectedTag)

    if (!normalizedSearch) return byTag

    return byTag.filter((flashcard) => {
      const haystack = [
        flashcard.word,
        flashcard.translation,
        flashcard.usageNote,
        flashcard.example,
        ...(flashcard.alternativeForms || []).flatMap((form) => [form.word, form.translation]),
      ]
        .filter(Boolean)
        .join(" ")
      
      const normalizedHaystack = normalizeForSearch(haystack)

      return normalizedHaystack.includes(normalizedSearch)
    })
  }, [displayedFlashcards, normalizedSearch, selectedTag])
  const studyFlashcards = filteredFlashcards
  const studyFilterChip = selectedTag === "all"
    ? null
    : <span className={cn("ml-0.5 inline-flex h-5 items-center rounded-full border border-current/20 bg-current/[0.07] px-2 text-[10px] font-semibold", tagTextColor[selectedTag])}>Filtering: {partOfSpeechLabels[selectedTag]}</span>

  const createCardFromAlternative = async (base: Flashcard, form: Flashcard["alternativeForms"][number]) => {
    // The action can remain queued in a stale render after the preference is
    // switched off. Do not send a generation request or propagate a family in
    // that case.
    if (!includeAlternativeForms) return

    const inputWord = form.word || base.word
    const targetPartOfSpeech = form.partOfSpeech

    const t = toast({
      title: "Gerando novo card...",
      description: `${inputWord} (${targetPartOfSpeech})`,
    })

    try {
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
            includeMultipleTranslations: true,
            efommMode,
            targetPartOfSpeech,
          },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "Erro ao gerar card")
      }
      const data: FlashcardAIResponse = await res.json()

      const flashcard: Flashcard = {
        id: crypto.randomUUID(),
        word: data.normalizedWord.toLowerCase(),
        partOfSpeech: data.partOfSpeech,
        grammaticalForm: normalizeGrammaticalForm(data.grammaticalForm),
        translation: limitGeneratedTranslation(data.translation, true),
        ipa: data.ipa || "",
        usageNote: data.usageNote || "",
        usageNoteEn: data.usageNoteEn || "",
        synonyms: data.synonyms,
        antonyms: data.antonyms,
        example: data.example,
        exampleTranslation: (data as any).exampleTranslation || "",
        alternativeForms: filterAlternativesByDeck(
          (data.alternativeForms || []).map((f) => ({ ...f, partOfSpeech: f.partOfSpeech as PartOfSpeech })),
          flashcards,
          inputWord,
          targetPartOfSpeech
        ),
        conjugations: data.conjugations ?? undefined,
        verbType: data.verbType ?? undefined,
        falseCognate: undefined,
        familyKey: normalizeFamilyKey(data.familyKey || data.normalizedWord),
        usageStatus: data.usageStatus ?? "current",
        folderId: base.folderId,
        createdAt: Date.now(),
      }

      const success = await addFlashcard(flashcard)
      if (success) {
        t.update({ id: t.id, title: "Card criado!", description: `${inputWord} (${targetPartOfSpeech})` })

        const freshDeck = await readAllFlashcardsFromDB()
        const family = await validateFamilyMembers(
          inputWord,
          targetPartOfSpeech,
          getFamilyMembers(inputWord, freshDeck)
        )

        for (const member of family) {
          const hasPromoted = (member.alternativeForms || []).some(
            (d) => d.word.toLowerCase() === inputWord.toLowerCase() && d.partOfSpeech === targetPartOfSpeech
          )
          if (hasPromoted) {
            await updateFlashcard({
              ...member,
              alternativeForms: (member.alternativeForms || []).filter(
                (d) => !(d.word.toLowerCase() === inputWord.toLowerCase() && d.partOfSpeech === targetPartOfSpeech)
              ),
            })
          }
        }

        const deckAfterCleanup = await readAllFlashcardsFromDB()
        const familyAfter = await validateFamilyMembers(
          inputWord,
          targetPartOfSpeech,
          getFamilyMembers(inputWord, deckAfterCleanup)
        )

        const canonicalByPOS = new Map<string, Flashcard["alternativeForms"][number]>()
        for (const member of familyAfter) {
          for (const d of member.alternativeForms || []) {
            if (!canonicalByPOS.has(d.partOfSpeech)) {
              canonicalByPOS.set(d.partOfSpeech, d)
            }
          }
        }

        let currentAlts = flashcard.alternativeForms || []
        for (const [pos, canonical] of canonicalByPOS) {
          if (pos === flashcard.partOfSpeech) continue
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
        currentAlts = filterAlternativesByDeck(
          filterArchaicAlternativeForms(currentAlts, flashcard.word),
          deckAfterCleanup,
          flashcard.word,
          flashcard.partOfSpeech
        )
        await updateFlashcard({ ...flashcard, alternativeForms: currentAlts })

        const newCardAsAlt: Flashcard["alternativeForms"][number] = {
          word: flashcard.word,
          partOfSpeech: flashcard.partOfSpeech,
          translation: flashcard.translation,
          example: flashcard.example,
        }
        await propagateDerivationToFamily(newCardAsAlt, inputWord, deckAfterCleanup, updateFlashcard)

        for (const [pos, canonical] of canonicalByPOS) {
          if (pos !== flashcard.partOfSpeech) {
            await propagateDerivationToFamily(canonical, inputWord, deckAfterCleanup, updateFlashcard)
          }
        }

      } else {
        t.update({ id: t.id, title: "Duplicate card", description: "This word already exists in this category.", variant: "destructive" })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      t.update({ id: t.id, title: "Erro ao gerar card", description: msg, variant: "destructive" })
    }
  }

  const handleAddWord = async (
    flashcard: Flashcard,
    meta?: { closeAfterAdd?: boolean }
  ): Promise<boolean> => {
    const targetFolderId = flashcard.folderId !== undefined
      ? flashcard.folderId
      : addDestinationFolderId === "__general__"
        ? null
        : addDestinationFolderId ?? selectedFolderId
    const filteredFlashcard = {
      ...flashcard,
      folderId: targetFolderId,
      alternativeForms: includeAlternativeForms
        ? filterAlternativesByDeck(
            filterArchaicAlternativeForms(flashcard.alternativeForms || [], flashcard.word),
            flashcards
          )
        : [],
    }
    const ok = await addFlashcard(filteredFlashcard)
    if (ok && (meta?.closeAfterAdd ?? true)) setIsAddOpen(false)

    if (ok && includeAlternativeForms) {
      const freshDeck = await readAllFlashcardsFromDB()
      const family = await validateFamilyMembers(
        filteredFlashcard.word,
        filteredFlashcard.partOfSpeech,
        getFamilyMembers(filteredFlashcard.word, freshDeck)
      )
      const canonicalByPOS = new Map<string, Flashcard["alternativeForms"][number]>()
      for (const member of family) {
        for (const d of member.alternativeForms || []) {
          if (d.partOfSpeech !== filteredFlashcard.partOfSpeech && !canonicalByPOS.has(d.partOfSpeech)) {
            canonicalByPOS.set(d.partOfSpeech, d)
          }
        }
      }
      let currentAlts = [...(filteredFlashcard.alternativeForms || [])]
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
      currentAlts = filterAlternativesByDeck(
        filterArchaicAlternativeForms(currentAlts, filteredFlashcard.word),
        freshDeck,
        filteredFlashcard.word,
        filteredFlashcard.partOfSpeech
      )
      await updateFlashcard({ ...filteredFlashcard, aiEnriching: filteredFlashcard.aiEnriching, alternativeForms: currentAlts })

      for (const alt of currentAlts) {
        propagateDerivationToFamily(alt, filteredFlashcard.word, freshDeck, updateFlashcard)
      }
    }

    // Derivations now come from the reviewed primary generation only. A second,
    // independent alternative-POS request used to overwrite this merged state
    // asynchronously, which is how invalid/repeated forms entered the deck.

    return ok
  }

  const openQuizletImport = () => {
    const selectedDestination = addDestinationFolderId ?? "__general__"
    setQuizletDestination(selectedDestination)
    setQuizletPdf(null)
    setQuizletEntries([])
    setQuizletImportError(null)
    setQuizletNewFolderName("")
    setShowQuizletImport(true)
  }

  const reviewQuizletImportPairs = async (entries: QuizletImportEntry[]): Promise<QuizletTranslationReview[]> => {
    const reviews: QuizletTranslationReview[] = []
    for (let start = 0; start < entries.length; start += 60) {
      const batch = entries.slice(start, start + 60)
      const response = await fetch("/api/ai/review-quizlet-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: batch }),
      })
      const payload = await response.json().catch(() => ({})) as {
        reviews?: QuizletTranslationReview[]
        error?: string
      }
      if (!response.ok) throw new Error(payload.error || "Could not review imported translations.")
      reviews.push(...(payload.reviews ?? []))
    }
    return reviews
  }

  const readQuizletPdf = async () => {
    if (!quizletPdf) return
    if (quizletPdf.type !== "application/pdf" && !quizletPdf.name.toLowerCase().endsWith(".pdf")) {
      setQuizletImportError("Choose a PDF exported from Quizlet.")
      return
    }

    setIsReadingQuizletPdf(true)
    setQuizletImportError(null)
    setQuizletEntries([])
    try {
      const pageImages = await renderQuizletPdfPages(quizletPdf)
      const extracted: QuizletImportEntry[] = []

      for (const imageData of pageImages) {
        const response = await fetch("/api/ai/import-quizlet-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData }),
        })
        const payload = await response.json().catch(() => ({})) as {
          entries?: QuizletImportEntry[]
          error?: string
        }
        if (!response.ok) throw new Error(payload.error || "Could not read a PDF page.")
        extracted.push(...(payload.entries ?? []))
      }

      const seen = new Set<string>()
      const entries = extracted.filter((entry) => {
        const key = `${entry.word.toLocaleLowerCase("en-US")}::${entry.translation.toLocaleLowerCase("pt-BR")}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (entries.length === 0) {
        throw new Error("No English–Portuguese pairs were found in this PDF.")
      }
      const normalizedEntries = entries.map((entry) => ({
        ...entry,
        translation: normalizeImportedTranslation(entry.translation),
      }))
      let reviews: QuizletTranslationReview[] = []
      try {
        reviews = await reviewQuizletImportPairs(normalizedEntries)
      } catch (reviewError) {
        console.error("[quizlet-import-review]", reviewError)
        setQuizletImportError("Pairs were extracted, but their automatic translation review was unavailable. The generator will validate them again.")
      }
      setQuizletEntries(normalizedEntries.map((entry, index) => {
        const review = reviews[index] ?? {
          verdict: "unverified" as const,
          translation: entry.translation,
          reason: "Will be validated again when the card is generated.",
        }
        const reviewedTranslation = normalizeImportedTranslation(review.translation || entry.translation)
        return {
          ...entry,
          translation: reviewedTranslation,
          originalTranslation: review.verdict === "corrected" ? entry.translation : undefined,
          review: { ...review, translation: reviewedTranslation },
          id: crypto.randomUUID(),
          selected: true,
        }
      }))
    } catch (error) {
      setQuizletImportError(error instanceof Error ? error.message : "Could not read the PDF.")
    } finally {
      setIsReadingQuizletPdf(false)
    }
  }

  const enqueueQuizletImport = async () => {
    const selectedEntries = quizletEntries.filter((entry) => entry.selected)
    if (selectedEntries.length === 0) {
      setQuizletImportError("Select at least one pair to generate.")
      return
    }
    if (selectedEntries.some((entry) => !entry.word.trim())) {
      setQuizletImportError("Selected pairs need an English word.")
      return
    }

    let targetFolderId: string | null
    if (quizletDestination === "__new__") {
      const name = quizletNewFolderName.trim()
      if (!name) {
        setQuizletImportError("Give the new folder a name first.")
        return
      }
      const folder = await addFolder(name)
      if (!folder) {
        setQuizletImportError("Could not create the destination folder.")
        return
      }
      targetFolderId = folder.id
    } else {
      targetFolderId = quizletDestination === "__general__" ? null : quizletDestination
    }

    const entriesToQueue: QuizletImportEntry[] = selectedEntries.map((entry) => ({
      word: entry.word.trim().replace(/\s+/g, " "),
      translation: normalizeImportedTranslation(entry.translation),
    }))
    for (const entry of entriesToQueue) {
      enqueueHomePipeline(targetFolderId, 1, async () => {
        const currentDeck = await readAllFlashcardsFromDB()
        const normalizedEntryWord = entry.word.toLocaleLowerCase("en-US")
        const existingPartsOfSpeech = [...new Set(currentDeck
          .filter((card) => card.word.toLocaleLowerCase("en-US") === normalizedEntryWord)
          .map((card) => card.partOfSpeech))]
        const response = await fetch("/api/ai/flashcard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: entry.word,
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
              preferredTranslation: entry.translation || undefined,
              existingPartsOfSpeech,
            },
          }),
        })
        const data = await response.json().catch(() => ({})) as FlashcardAIResponse & { error?: string }
        if (!response.ok) throw new Error(data.error || `Could not generate “${entry.word}”.`)

        const flashcard: Flashcard = {
          id: crypto.randomUUID(),
          word: data.normalizedWord.toLowerCase(),
          partOfSpeech: data.partOfSpeech,
          grammaticalForm: normalizeGrammaticalForm(data.grammaticalForm),
          // The generator validates the imported sense and returns a translation
          // coherent with the example, context, and part of speech.
          translation: data.translation,
          ipa: data.ipa || "",
          usageNote: data.usageNote || "",
          usageNoteEn: data.usageNoteEn || "",
          synonyms: data.synonyms || [],
          antonyms: data.antonyms || [],
          example: data.example || "",
          exampleTranslation: data.exampleTranslation || "",
          alternativeForms: (data.alternativeForms || []).map((form) => ({
            ...form,
            partOfSpeech: form.partOfSpeech as PartOfSpeech,
          })),
          conjugations: data.conjugations ?? undefined,
          verbType: data.verbType ?? undefined,
          falseCognate: undefined,
          familyKey: normalizeFamilyKey(data.familyKey || data.normalizedWord),
          usageStatus: data.usageStatus ?? "current",
          folderId: targetFolderId,
          createdAt: Date.now(),
        }
        await handleAddWord(flashcard, { closeAfterAdd: false })
      })
    }

    setShowQuizletImport(false)
    toast({
      title: "Import added to the queue",
      description: `${entriesToQueue.length} ${entriesToQueue.length === 1 ? "card" : "cards"} will be generated in order.`,
    })
  }

  const updateQuizletEntry = (id: string, field: keyof QuizletImportEntry, value: string) => {
    setQuizletEntries((current) => current.map((entry) => (
      entry.id === id
        ? {
            ...entry,
            [field]: value,
            review: field === "translation"
              ? { verdict: "unverified", translation: value, reason: "Edited manually; the generator will validate this sense again." }
              : entry.review,
          }
        : entry
    )))
  }

  const toggleQuizletEntry = (id: string, selected: boolean) => {
    setQuizletEntries((current) => current.map((entry) => (
      entry.id === id ? { ...entry, selected } : entry
    )))
  }

  const selectedQuizletEntriesCount = quizletEntries.filter((entry) => entry.selected).length

  const handleClearReviewFolder = async () => {
    if (reviewFlashcards.length === 0) return
    const results = await Promise.all(reviewFlashcards.map((card) => removeFromReviewFolder(card.id)))
    const removedCount = results.filter(Boolean).length

    toast({
      title: removedCount > 0 ? "Review cleared" : "Nothing changed",
      description:
        removedCount > 0
          ? `${removedCount} ${removedCount === 1 ? "word removed" : "words removed"} from Review folder.`
          : "Could not remove cards from Review.",
      variant: removedCount > 0 ? "default" : "destructive",
    })
  }

  const isViewingFolder = selectedFolderId !== null || isReviewFolderSelected || isViewingGeneral

  // Update context when folder view changes
  useEffect(() => {
    setIsInsideFolder(isViewingFolder)
  }, [isViewingFolder, setIsInsideFolder])

  // Set goBack function
  useEffect(() => {
    setGoBack(() => {
      setSelectedFolderId(null)
      setIsReviewFolderSelected(false)
      setIsViewingGeneral(false)
      setSelectedReviewFolderId(null)
      setSearchQuery("")
      setSelectedTag("all")
    })
  }, [setGoBack])

  // Set onShowStats function
  useEffect(() => {
    setOnShowStats(() => {
      setIsStatsOpen(true)
    })
  }, [setOnShowStats])

  if (isWritingMode) {
    return (
      <WritingMode
        flashcards={writingModeCards}
        folderName={isReviewStudy ? "Review" : studyFolderName}
        onMarkForReview={isReviewStudy ? undefined : addToReviewFolder}
        onRecordResult={recordStudyResult}
        onMarkAsLearned={removeFromReviewFolder}
        onExit={() => {
          setIsWritingMode(false)
          setWritingModeCards([])
          setIsReviewStudy(false)
        }}
      />
    )
  }

  if (isStudying && effectiveStudyCards.length > 0) {
    return (
      <StudyMode
        flashcards={effectiveStudyCards}
        folderName={isReviewStudy ? "Review" : studyFolderName}
        onMarkForReview={isReviewStudy ? undefined : addToReviewFolder}
        onRecordResult={recordStudyResult}
        onMarkAsLearned={removeFromReviewFolder}
        onExit={() => {
          setIsStudying(false)
          setStudyCards(null)
          setIsReviewStudy(false)
        }}
      />
    )
  }

  if (isChoiceMode && effectiveStudyCards.length > 0) {
    return (
      <VocabularyChoiceMode
        flashcards={effectiveStudyCards}
        folderName={isReviewStudy ? "Review" : studyFolderName}
        onMarkForReview={isReviewStudy ? undefined : addToReviewFolder}
        onRecordResult={recordStudyResult}
        onMarkAsLearned={removeFromReviewFolder}
        onExit={() => {
          setIsChoiceMode(false)
          setStudyCards(null)
          setIsReviewStudy(false)
        }}
      />
    )
  }

  return (
    <div className="w-full">
      <Dialog
        open={showQuizletImport}
        onOpenChange={setShowQuizletImport}
      >
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] max-w-[92vw] flex-col overflow-hidden sm:max-w-2xl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>Import a Quizlet PDF</DialogTitle>
            <DialogDescription className="break-words [overflow-wrap:anywhere]">
              Upload a Quizlet export with English on one side and Portuguese on the other. The original Portuguese translation is kept on each card.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
              <label className="flex cursor-pointer items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileUp className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground/80">Choose Quizlet PDF</span>
                  <span className="block line-clamp-2 break-words text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                    {quizletPdf ? quizletPdf.name : "PDF only · up to the first 30 pages"}
                  </span>
                </span>
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    setQuizletPdf(event.target.files?.[0] ?? null)
                    setQuizletEntries([])
                    setQuizletImportError(null)
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destination</p>
              <select
                value={quizletDestination}
                onChange={(event) => setQuizletDestination(event.target.value)}
                className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground/80 outline-none focus:border-primary/40"
              >
                <option value="__general__">{generalFolderName}</option>
                {folders.filter((folder) => folder.name !== "Review").map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
                <option value="__new__">Create a new folder…</option>
              </select>
              {quizletDestination === "__new__" && (
                <Input
                  value={quizletNewFolderName}
                  onChange={(event) => setQuizletNewFolderName(event.target.value)}
                  placeholder="New folder name"
                  className="h-9"
                />
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!quizletPdf || isReadingQuizletPdf}
              onClick={readQuizletPdf}
            >
              {isReadingQuizletPdf ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}
              {isReadingQuizletPdf ? "Reading PDF…" : "Read vocabulary pairs"}
            </Button>

            {quizletImportError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{quizletImportError}</p>
            )}

            {quizletEntries.length > 0 && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <CheckCircle2 className="size-4 text-primary" />
                  {quizletEntries.length} {quizletEntries.length === 1 ? "pair found" : "pairs found"}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      const selectAll = selectedQuizletEntriesCount !== quizletEntries.length
                      setQuizletEntries((current) => current.map((entry) => ({ ...entry, selected: selectAll })))
                    }}
                  >
                    {selectedQuizletEntriesCount === quizletEntries.length ? "Clear all" : "Select all"}
                  </Button>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Review every pair before creating the cards. Disabled pairs are never sent to card generation. Leave Portuguese blank to let the card AI complete it.
                </p>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.25fr)] gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Generate</span>
                  <span>English</span>
                  <span>Portuguese</span>
                </div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {quizletEntries.map((entry, index) => (
                    <div
                      key={entry.id}
                      className={cn(
                        "grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-2 rounded-lg border border-border/50 bg-background/70 p-2 transition-opacity",
                        !entry.selected && "opacity-45"
                      )}
                    >
                      <Switch
                        checked={entry.selected}
                        onCheckedChange={(checked) => toggleQuizletEntry(entry.id, checked)}
                        aria-label={`Generate ${entry.word || `entry ${index + 1}`}`}
                      />
                      <Input
                        value={entry.word}
                        onChange={(event) => updateQuizletEntry(entry.id, "word", event.target.value)}
                        aria-label={`English word ${index + 1}`}
                        className="h-8 min-w-0 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-1"
                      />
                      <Input
                        value={entry.translation}
                        onChange={(event) => updateQuizletEntry(entry.id, "translation", event.target.value)}
                        aria-label={`Portuguese translation ${index + 1}`}
                        placeholder="AI will generate the translation"
                        className="h-8 min-w-0 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      />
                      {entry.review.verdict === "corrected" && (
                        <p className="col-span-3 border-t border-amber-500/15 pt-1 text-[11px] text-amber-700 dark:text-amber-300">
                          Dictionary review replaced “{entry.originalTranslation}”: {entry.review.reason || "The original sense did not match this English entry."}
                        </p>
                      )}
                      {entry.review.verdict === "unverified" && entry.translation && (
                        <p className="col-span-3 border-t border-border/40 pt-1 text-[11px] text-muted-foreground">
                          {entry.review.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
          <div className="flex shrink-0 justify-end border-t border-border/50 pt-3">
            <Button type="button" disabled={selectedQuizletEntriesCount === 0 || isReadingQuizletPdf} onClick={enqueueQuizletImport}>
              Generate {selectedQuizletEntriesCount || ""} selected
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={false} onOpenChange={() => undefined}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[96vw] flex-col overflow-hidden [&_span.truncate]:whitespace-normal [&_span.truncate]:break-words [&_span.truncate]:overflow-visible [&_span.truncate]:leading-snug sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><ArrowRightLeft className="size-4" /></span>Sistema de transferência</DialogTitle>
            <DialogDescription>1. Selecione um grupo · 2. Escolha o destino · 3. Confirme. A pasta de origem nunca é apagada.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pt-4 pr-1 scrollbar-hide">
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3"><span className="text-sm font-semibold">1. Select cards</span><span className="text-xs text-muted-foreground">Filter or select individually</span></div>
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">Regra de seleção
              <select value={transferMode} onChange={(event) => setTransferMode(event.target.value as "all" | "tag" | "selected" | "streak")} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground">
                <option value="all">Todos os cards</option><option value="tag">Uma tag específica</option><option value="selected">Cards selecionados</option><option value="streak">Acertos consecutivos</option>
              </select>
            </label>
            {transferMode === "tag" && <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">Tag
              <select value={transferTag} onChange={(event) => setTransferTag(event.target.value as PartOfSpeech | "all")} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground"><option value="all">Choose a tag</option>{Object.entries(partOfSpeechLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </label>}
            {transferMode === "streak" && <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">Minimum consecutive correct answers
              <Input type="number" min={1} max={99} value={transferStreak} onChange={(event) => setTransferStreak(Math.max(1, Number(event.target.value) || 1))} />
            </label>}
            {transferMode === "selected" && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Select individual cards</p><div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-background p-2 scrollbar-hide">{flashcards.filter((card) => card.folderId === editingFolderId && !card.isReviewFolder).map((card) => <label key={card.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/50"><input type="checkbox" className="size-4 accent-primary" checked={transferSelectedIds.has(card.id)} onChange={() => setTransferSelectedIds((current) => { const next = new Set(current); next.has(card.id) ? next.delete(card.id) : next.add(card.id); return next })} /><span className="min-w-0 flex-1 truncate">{card.word}</span><span className="text-[10px] text-muted-foreground">{partOfSpeechLabels[card.partOfSpeech]}</span><span className="text-[10px] text-muted-foreground">{card.studyStreak ?? 0}×</span></label>)}</div></div>}
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3"><span className="text-sm font-semibold">2. Choose a destination</span><span className="text-xs text-muted-foreground">Source stays intact</span></div>
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">Destino
              <select value={transferDestination} onChange={(event) => setTransferDestination(event.target.value)} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground">
                <option value="">Escolha uma pasta</option>
                {folders.filter((folder) => folder.id !== editingFolderId).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                <option value="__new__">Create a new folder…</option>
              </select>
            </label>
            {transferDestination === "__new__" && <Input autoFocus value={transferNewFolderName} onChange={(event) => setTransferNewFolderName(event.target.value)} placeholder="New folder name" />}
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">The source folder and its color remain unchanged. “Again” resets the consecutive-answer counter. Review cards are never moved by this tool.</p>
            <Button className="w-full" disabled={transferBusy || !transferDestination || (transferDestination === "__new__" && !transferNewFolderName.trim())} onClick={() => void transferWithRules()}>{transferBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRightLeft className="mr-2 size-4" />}Move matching cards</Button>
          </div>
        </DialogContent>
      </Dialog>

      <FolderTransferDialog open={transferTrayOpen} onOpenChange={setTransferTrayOpen} sourceName={editingFolderId === null ? generalFolderName : folders.find((folder) => folder.id === editingFolderId)?.name ?? ""} items={flashcards.filter((card) => card.folderId === editingFolderId && !card.isReviewFolder).map((card) => ({ id: card.id, label: card.word, detail: card.translation, tag: card.partOfSpeech, tagLabel: partOfSpeechLabels[card.partOfSpeech], streak: card.studyStreak ?? 0 }))} folders={folders.filter((folder) => folder.id !== editingFolderId).map((folder) => ({ id: folder.id, name: folder.name, count: flashcards.filter((card) => card.folderId === folder.id).length }))} tagOptions={(Object.keys(partOfSpeechLabels) as PartOfSpeech[]).map((value) => ({ value, label: partOfSpeechLabels[value] }))} onCreateFolder={async (name) => await addFolder(name)} onTransfer={transferSelectedCards} />

      {/* ═══════════════════════════════════════════════════════════════
          HOME VIEW - Input + Folders only
         ═══════════════════════════════════════════════════════════════ */}
      {!isViewingFolder && (
        <>
          {/* ── Hero Section ─────────────────────────────────────── */}
          <div className="mb-20 flex flex-col items-center gap-6 pt-4 sm:mb-16 sm:pt-6">
            {/* Brand watermark title */}
            <h1 className="lab-title select-none font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">
              VocabLab
            </h1>

            {/* Add-word input area */}
            <div className="w-full max-w-md">
              <div className="relative rounded-2xl border border-border/40 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm">
                <AddFlashcardForm
                  onAdd={handleAddWord}
                  onUpdate={updateFlashcard}
                  folderId={inputFolderId}
                  pipelineMode
                  onPipelineEnqueue={enqueueHomePipeline}
                  beforeSubmit={requireHomeDestination}
                  bare
                />
              </div>
            </div>
          </div>

          {/* ── Folders Grid ─────────────────────────────────────── */}
          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {/* General is only shown when it contains unfiled cards. */}
              {flashcards.some((flashcard) => !flashcard.folderId) && <FolderCard
                name={generalFolderName}
                wordCount={flashcards.filter((f) => !f.folderId).length}
                subtitle={pipelineSubtitle(null, flashcards.filter((f) => !f.folderId).length)}
                gradient={getFolderGradient("__general__", 0)}
                isSelected={isViewingGeneral}
                isAddDestination={addDestinationFolderId === "__general__"}
                onClick={() => { setIsViewingGeneral(true); setSelectedFolderId(null); setIsReviewFolderSelected(false); setSelectedReviewFolderId(null) }}
                onContextMenu={(event) => { event.preventDefault(); selectAddDestination("__general__", generalFolderName) }}
                onSettings={(e) => {
                  e.stopPropagation()
                  setEditingFolderId(null)
                  setEditingFolderName(generalFolderName)
                  setIsEditingReviewFolder(false)
                  setIsRenameDialogOpen(true)
                }}
              />}

              {/* User folders - filter out any old "Review" folders */}
              {folders.filter(f => f.name !== "Review").map((folder, idx) => {
                const folderWords = flashcards.filter((f) => f.folderId === folder.id)
                return (
                  <FolderCard
                    key={folder.id}
                    name={folder.name}
                    wordCount={folderWords.length}
                    subtitle={pipelineSubtitle(folder.id, folderWords.length)}
                    gradient={getFolderGradient(folder.id, idx)}
                    isSelected={!isReviewFolderSelected && selectedFolderId === folder.id}
                    isAddDestination={addDestinationFolderId === folder.id}
                    onClick={() => { setSelectedFolderId(folder.id); setIsReviewFolderSelected(false); setSelectedReviewFolderId(null) }}
                    onContextMenu={(event) => { event.preventDefault(); selectAddDestination(folder.id, folder.name) }}
                    onSettings={(e) => {
                      e.stopPropagation()
                      setEditingFolderId(folder.id)
                      setEditingFolderName(folder.name)
                      setIsEditingReviewFolder(false)
                      setIsRenameDialogOpen(true)
                    }}
                  />
                )
              })}

              {/* New folder button */}
              <NewFolderCard
                onClick={() => { setNewFolderName(""); setIsDialogOpen(true) }}
                onImport={openQuizletImport}
              />
            </div>

            {/* Review folders - appears below with line break */}
            {Object.keys(reviewFoldersByParent).length > 0 && (
              <>
                <div className="my-4 border-t border-border/30" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(reviewFoldersByParent).map(([parentFolderId, count]) => {
                    const parentFolderName = parentFolderId === "__general__" 
                      ? generalFolderName 
                      : folders.find(f => f.id === parentFolderId)?.name || "Unknown"
                    return (
                      <FolderCard
                        key={`review-${parentFolderId}`}
                        name={reviewFolderTitle(parentFolderName, VOCAB_CURATED_FOLDER_NAMES)}
                        wordCount={count}
                        gradient="amber"
                        isReview={true}
                        isSelected={isReviewFolderSelected && selectedReviewFolderId === parentFolderId}
                        onClick={() => { 
                          setIsReviewFolderSelected(true); 
                          setSelectedFolderId(null)
                          setSelectedReviewFolderId(parentFolderId)
                        }}
                        onSettings={(event) => {
                          event.stopPropagation()
                          setEditingFolderId(parentFolderId === "__general__" ? null : parentFolderId)
                          setEditingFolderName(parentFolderName)
                          setSelectedReviewFolderId(parentFolderId)
                          setIsEditingReviewFolder(true)
                          setIsRenameDialogOpen(true)
                        }}
                      />
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          FOLDER VIEW - Inside a folder
         ═══════════════════════════════════════════════════════════════ */}
      {isViewingFolder && (
        <>
          {/* ── Hero Section (EXACT copy from home) ──────────────── */}
          <div className="mb-8 flex flex-col items-center gap-6 pt-4 sm:mb-10 sm:pt-6">
            {/* Brand watermark title */}
            <h1 className="lab-title select-none font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">
              VocabLab
            </h1>

            {/* Add-word input area */}
            <div className="w-full max-w-md">
              <div className="relative rounded-2xl border border-border/40 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm">
                <AddFlashcardForm onAdd={handleAddWord} onUpdate={updateFlashcard} folderId={inputFolderId} bare />
              </div>
            </div>
          </div>

          {!isReviewFolderSelected && activeFolderPipelineCount > 0 && (
            <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              Processing {activeFolderPipelineCount} {activeFolderPipelineCount === 1 ? "card" : "cards"} in this folder. Avoid submitting the same word again.
            </div>
          )}

          {/* ── Control Bar + Search + Study button ──────────────── */}
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Search bar */}
              <div className={cn(
                "flex h-9 min-w-0 items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-0 shadow-sm",
                layout === "list" && "w-full",
                layout === "grid" && "w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]",
                layout === "compact" && "w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/4)] xl:w-[calc((100%-4rem)/5)]"
              )}>
                <Search className="size-4 shrink-0 text-muted-foreground/60" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={layout === "compact" ? "Search by word" : "Search by word, translation or context"}
                  className="h-6 border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        "size-6 shrink-0 rounded-full",
                        selectedTag !== "all" && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                      )}
                      title={selectedTag === "all" ? "Filter by tag" : `Filtering: ${partOfSpeechLabels[selectedTag]}`}
                    >
                      <Tag className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuLabel>Filter by tag</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setSelectedTag("all")}
                      className={cn(selectedTag === "all" && "text-primary")}
                    >
                      All
                    </DropdownMenuItem>
                    {(Object.keys(partOfSpeechLabels) as PartOfSpeech[]).map((part) => (
                      <DropdownMenuItem
                        key={part}
                        onClick={() => setSelectedTag(part)}
                        className={cn(selectedTag === part && "text-primary")}
                      >
                        {partOfSpeechLabels[part]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 rounded-full"
                    onClick={() => setSearchQuery("")}
                    title="Clear search"
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </div>

              {/* Study button - aligned with search bar */}
              <div className="flex items-center gap-2">
                {!isLoading && studyFlashcards.length > 0 && (
                  isReviewFolderSelected ? (
                    <Dialog open={showReviewStudySelector} onOpenChange={setShowReviewStudySelector}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full px-3 text-[13px]">
                          <GraduationCap className="size-3.5" />
                          Study in <span className="font-medium text-blue-600 dark:text-blue-400">{studyFolderName}</span> as {studyFlashcards.length} words{studyFilterChip}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Start study</DialogTitle>
                          <DialogDescription>Choose how you want to review this folder.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-2">
                          <Button
                            variant="outline"
                            className="h-auto justify-start p-4 text-left"
                            disabled={!canUseVocabularyMultipleChoice(studyFlashcards, includeMultipleTranslations)}
                            onClick={() => {
                              setShowReviewStudySelector(false)
                              const cardsToStudy = studyFlashcards
                              setIsReviewStudy(true)
                              setStudyCards(cardsToStudy)
                              setIsChoiceMode(true)
                            }}
                          >
                            <span><span className="block text-sm">Multiple choice</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{canUseVocabularyMultipleChoice(studyFlashcards, includeMultipleTranslations) ? "Choose the correct meaning among related word-family alternatives." : "Requires at least 10 cards and 4 distinct answers."}</span></span>
                          </Button>
                          <Button
                            variant="outline"
                            className="h-auto justify-start p-4 text-left"
                            onClick={() => {
                              setShowReviewStudySelector(false)
                              // Study only the cards from this specific review folder
                              const cardsToStudy = studyFlashcards
                              setIsReviewStudy(true)
                              setWritingModeCards([...cardsToStudy])
                              setIsWritingMode(true)
                            }}
                          >
                            <span><span className="block text-sm">Active recall</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Try to remember the meaning before revealing it.</span></span>
                          </Button>
                          <Button
                            variant="outline"
                            className="h-auto justify-start p-4 text-left"
                            onClick={() => {
                              setShowReviewStudySelector(false)
                              setIsReviewStudy(true)
                              // Study only the cards from this specific review folder
                              const cardsToStudy = studyFlashcards
                              setStudyCards(cardsToStudy)
                              setIsStudying(true)
                            }}
                          >
                            <span><span className="block text-sm">Flip cards</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Turn the card and mark whether you knew it.</span></span>
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <Dialog open={showStudySelector} onOpenChange={setShowStudySelector}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full px-3 text-[13px]">
                          <GraduationCap className="size-3.5" />
                          Study in <span className="font-medium text-blue-600 dark:text-blue-400">{isViewingGeneral ? generalFolderName : selectedFolder?.name ?? "all"}</span> as {studyFlashcards.length} words{studyFilterChip}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Start study</DialogTitle>
                          <DialogDescription>Choose how you want to review this folder.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-2">
                          <Button variant="outline" disabled={!canUseVocabularyMultipleChoice(studyFlashcards, includeMultipleTranslations)} className="h-auto justify-start p-4 text-left" onClick={() => { setShowStudySelector(false); setIsReviewStudy(false); setStudyCards(studyFlashcards); setIsChoiceMode(true) }}>
                            <span><span className="block text-sm">Multiple choice</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{canUseVocabularyMultipleChoice(studyFlashcards, includeMultipleTranslations) ? "Choose the correct meaning among related word-family alternatives." : "Requires at least 10 cards and 4 distinct answers."}</span></span>
                          </Button>
                          <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => { setShowStudySelector(false); setIsReviewStudy(false); setWritingModeCards([...studyFlashcards]); setIsWritingMode(true) }}>
                            <span><span className="block text-sm">Active recall</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Try to remember the meaning before revealing it.</span></span>
                          </Button>
                          <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => { setShowStudySelector(false); setIsReviewStudy(false); setStudyCards(studyFlashcards); setIsStudying(true) }}>
                            <span><span className="block text-sm">Flip cards</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Turn the card and mark whether you knew it.</span></span>
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )
                )}
              </div>
            </div>
          </div>

          {/* ── Cards section ───────────────────────────────────── */}
          <div className="mt-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : displayedFlashcards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <BookOpen className="size-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg text-foreground mb-1">
                  {isReviewFolderSelected
                    ? "No words to review"
                    : isViewingGeneral
                    ? "Nenhum flashcard na General"
                    : selectedFolderId
                    ? "No flashcards in this folder"
                    : "No flashcards yet"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {isReviewFolderSelected
                    ? "Great! You have no pending review words."
                    : isViewingGeneral
                    ? 'Use o campo acima para adicionar sua primeira palavra na pasta General.'
                    : selectedFolderId
                    ? 'Use the field above to add your first word to this folder.'
                    : 'Click "+ New Word" to start building your vocabulary.'}
                </p>
              </div>
            ) : (
              <div>
                {normalizedSearch && filteredFlashcards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-12 text-center">
                    <Search className="mb-3 size-8 text-muted-foreground/50" />
                    <h3 className="text-base font-medium text-foreground">No cards found</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      Try searching by the English word, Portuguese translation, context, or adjust the tag filter.
                    </p>
                  </div>
                ) : (
                  <div key={layout} className={cn(
                    "grid gap-4",
                    layout === "grid" && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                    layout === "list" && "grid-cols-1",
                    layout === "compact" && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  )}>
                    {filteredFlashcards.map((flashcard) => (
                      <FlashcardCard
                        key={flashcard.id}
                        flashcard={flashcard}
                        onDelete={handleDeleteDisplayedFlashcard}
                        onCreateFromAlternative={createCardFromAlternative}
                        onUpdateFlashcard={updateFlashcard}
                        layout={layout}
                        squareCards={squareCards}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Stats Sheet ──────────────────────────────────────── */}
      <Sheet open={isStatsOpen} onOpenChange={setIsStatsOpen}>
        <SheetContent side="right" className="w-[92vw] max-w-md p-0 sm:w-[26rem]">
          <SheetHeader className="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
            <SheetTitle className="flex items-center gap-2 text-[15px] leading-none">
              <BarChart2 className="size-4 shrink-0 text-primary" />
              Study Progress
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
            <div className="p-5">
            <div className="space-y-5">
              <section className="grid grid-cols-2 gap-3">
                {[
                  { icon: Layers3, label: "No deck", value: allFlashcards.length, tone: "text-primary/70" },
                  { icon: Target, label: "No Review", value: reviewFlashcards.length, tone: "text-amber-500/80" },
                  { icon: Flame, label: "Mastered", value: masteredCards, tone: "text-success/80" },
                  { icon: TrendingUp, label: "Cobertura", value: `${deckCoverage}%`, tone: "text-primary/70" },
                ].map((stat) => (
                  <div key={stat.label} className="stat-bento min-h-[98px] flex-col items-center justify-between gap-2 px-3 py-3 text-center">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <stat.icon className={cn("size-3.5", stat.tone)} />
                    </div>
                    <div className="flex w-full min-w-0 flex-col items-center gap-1">
                      <p className="text-2xl font-bold leading-none tracking-[-0.03em] tabular-nums">{stat.value}</p>
                      <p className="max-w-full line-clamp-2 break-words text-[10px] uppercase leading-3 tracking-[0.07em] text-muted-foreground [overflow-wrap:anywhere]">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </section>
              {isProgressLoaded && studyStats.totalSessions > 0 ? (
              <div className="hidden">
                {[
                  { icon: Calendar, label: "Sessões", value: studyStats.totalSessions, tone: "text-primary/70" },
                  { icon: GraduationCap, label: "Cards estudados", value: studyStats.totalCards, tone: "text-primary/70" },
                  { icon: Target, label: "Acertos na 1ª", value: studyStats.totalCorrectFirstTry, tone: "text-success/70" },
                  { icon: TrendingUp, label: "Precisão", value: `${studyStats.averageAccuracy}%`, tone: "text-primary/70" },
                ].map((stat) => (
                  <div key={stat.label} className="stat-bento min-h-[112px] flex-col items-start justify-between gap-3 px-4 py-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
                      <stat.icon className={cn("size-3.5", stat.tone)} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold leading-none tracking-[-0.03em] tabular-nums">{stat.value}</p>
                      <p className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/20 p-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
                  <BarChart2 className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Ainda não há sessões salvas. Estude alguns cards para começar a acompanhar seu progresso.</p>
              </div>
            )}
            {isProgressLoaded && studyStats.totalSessions > 0 && (
              <>
                <section className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Calendar, label: "Sessões", value: studyStats.totalSessions, tone: "text-primary/70" },
                    { icon: GraduationCap, label: "Cards estudados", value: studyStats.totalCards, tone: "text-primary/70" },
                    { icon: BookOpen, label: "Cards únicos", value: studyStats.uniqueCardsStudied, tone: "text-primary/70" },
                    { icon: CheckCircle2, label: "Acertos 1ª", value: studyStats.totalCorrectFirstTry, tone: "text-success/80" },
                    { icon: TrendingUp, label: "Precisão média", value: `${studyStats.averageAccuracy}%`, tone: "text-primary/70" },
                    { icon: XCircle, label: "Again", value: studyStats.totalMistakes, tone: "text-destructive/80" },
                    { icon: Target, label: "Cards com erro", value: studyStats.mistakeCards, tone: "text-amber-500/80" },
                    { icon: Timer, label: "Tempo total", value: `${studyStats.totalStudyMinutes} min`, tone: "text-primary/70" },
                  ].map((stat) => (
                    <div key={stat.label} className="stat-bento min-h-[92px] flex-col items-center justify-between gap-2 px-3 py-3 text-center">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <stat.icon className={cn("size-3.5", stat.tone)} />
                      </div>
                      <div className="flex w-full min-w-0 flex-col items-center gap-1">
                        <p className="text-xl font-bold leading-none tracking-[-0.03em] tabular-nums">{stat.value}</p>
                        <p className="max-w-full line-clamp-2 break-words text-[10px] uppercase leading-3 tracking-[0.07em] text-muted-foreground [overflow-wrap:anywhere]">{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </section>
                <section className="rounded-2xl border border-border/40 bg-card/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground/80">Ritmo recente</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{studyStats.sessionsLast7Days} sessões nos últimos 7 dias · {studyStats.daysStudied} dias estudados</p>
                    </div>
                    <CalendarDays className="size-4 text-primary/70" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                    <div><span className="text-muted-foreground">Média por sessão</span><p className="mt-1 text-sm font-semibold tabular-nums">{studyStats.averageSessionCards} cards</p></div>
                    <div><span className="text-muted-foreground">Melhor precisão</span><p className="mt-1 text-sm font-semibold tabular-nums">{studyStats.bestAccuracy}%</p></div>
                  </div>
                </section>
                <section className="rounded-2xl border border-border/40 bg-card/60 p-4">
                  <p className="text-xs font-semibold text-foreground/80">Distribuição por Lab</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(studyStats.labBreakdown).map(([lab, count]) => (
                      <span key={lab} className="rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                        {lab === "vocab" ? "VocabLab" : lab === "regency" ? "RegencyLab" : "RuleLab"}: {count}
                      </span>
                    ))}
                  </div>
                </section>
                <section className="rounded-2xl border border-border/40 bg-card/60 p-4">
                  <p className="text-xs font-semibold text-foreground/80">Distribuição por modo</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(studyStats.modeBreakdown).filter(([, count]) => count > 0).map(([mode, count]) => (
                      <span key={mode} className="rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                        {mode === "multiple-choice" ? "Multiple choice" : mode === "active-recall" ? "Active recall" : mode === "writing" ? "Writing" : "Flip cards"}: {count}
                      </span>
                    ))}
                  </div>
                </section>
                <p className="text-[11px] text-muted-foreground">
                  Última sessão: {studyStats.lastSession?.folderName ?? "—"} · {studyStats.lastSession ? new Date(studyStats.lastSession.date).toLocaleDateString("pt-BR") : "—"}
                </p>
              </>
            )}
            </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── New Folder Dialog ────────────────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Organize your flashcards into folders by topic or level.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Input
              placeholder="Nome da pasta"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder() }}
            />
            <Button onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName.trim()}>
              {isCreatingFolder ? <Loader2 className="size-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Rename/Manage Folder Dialog ──────────────────────── */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[94vw] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar pasta</DialogTitle>
            <DialogDescription>
              {isEditingReviewFolder
                ? `Gerencie a fila de revisão de "${editingFolderName}".`
                : editingFolderId === null
                ? `Gerencie a pasta "${generalFolderName}".`
                : `Gerencie a pasta "${editingFolderName}".`}
            </DialogDescription>
          </DialogHeader>
          {!isEditingReviewFolder && <FolderManagerPanel
            name={editingFolderName}
            onNameChange={setEditingFolderName}
            onRename={handleRenameFolder}
            renaming={isRenamingFolder}
            colors={[
              { id: "default", className: "bg-blue-400/50", label: "Azul" },
              { id: "violet", className: "bg-violet-400/30", label: "Violeta" },
              { id: "emerald", className: "bg-emerald-400/30", label: "Verde" },
              { id: "amber", className: "bg-amber-400/30", label: "Amarelo" },
              { id: "rose", className: "bg-rose-400/30", label: "Rosa" },
            ]}
            activeColor={folderColors[editingFolderId ?? "__general__"] ?? "default"}
            onColorChange={(color) => {
              if (editingFolderId === null) {
                const next = { ...folderColors, __general__: color }
                setFolderColors(next)
                localStorage.setItem("vocablab_folder_colors", JSON.stringify(next))
              } else updateFolderColor(editingFolderId, color)
            }}
            cardCount={flashcards.filter((card) => card.folderId === editingFolderId && !card.isReviewFolder).length}
            groupCount={new Set(flashcards.filter((card) => card.folderId === editingFolderId && !card.isReviewFolder).map((card) => card.partOfSpeech)).size}
            groupLabel="tags"
            onTransfer={() => { setTransferMode("all"); setTransferTag("all"); setTransferSelectedIds(new Set()); setTransferStreak(0); setTransferDestination(""); setTransferTrayOpen(true) }}
            onDelete={() => setShowDeleteConfirm(true)}
          />}
          {isEditingReviewFolder && selectedReviewFolderId && (
            <div className="space-y-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
              <div>
                <p className="text-sm font-semibold text-foreground/85">Review queue</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  This is a virtual view of the original cards. Removing a card here only removes it from Review; it never deletes the source card.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <p className="text-xl font-semibold tabular-nums">{allFlashcards.filter((card) => card.isReviewFolder && (card.folderId ?? "__general__") === selectedReviewFolderId).length}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">cards in review</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <p className="text-xl font-semibold tabular-nums">{new Set(allFlashcards.filter((card) => card.isReviewFolder && (card.folderId ?? "__general__") === selectedReviewFolderId).map((card) => card.partOfSpeech)).size}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">tags</p>
                </div>
              </div>
              <Button variant="destructive" className="w-full gap-2" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="size-4" />
                Delete Review folder
              </Button>
            </div>
          )}
          <div className="hidden">
            {!isEditingReviewFolder && <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/40 bg-muted/20 p-3"><div><p className="text-xl font-semibold tabular-nums">{flashcards.filter((card) => card.folderId === editingFolderId && !card.isReviewFolder).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">cards</p></div><div><p className="text-xl font-semibold tabular-nums">{new Set(flashcards.filter((card) => card.folderId === editingFolderId && !card.isReviewFolder).map((card) => card.partOfSpeech)).size}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">tags</p></div></div>}
            {/* Folder name - renameable for all folders including General */}
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Nome da pasta</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome da pasta"
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder() }}
                />
                <Button
                  onClick={handleRenameFolder}
                  disabled={isRenamingFolder || !editingFolderName.trim()}
                  variant="outline"
                >
                  {isRenamingFolder ? <Loader2 className="size-4 animate-spin" /> : "Renomear"}
                </Button>
              </div>
            </div>

            {/* Color options - for all folders */}
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Cor da pasta</label>
              <div className="flex gap-2">
                {[
                  { id: "default", color: "bg-blue-400/50", label: "Blue" },
                  { id: "violet", color: "bg-violet-400/30", label: "Violet" },
                  { id: "emerald", color: "bg-emerald-400/30", label: "Green" },
                  { id: "amber", color: "bg-amber-400/30", label: "Yellow" },
                  { id: "rose", color: "bg-rose-400/30", label: "Rose" },
                ].map((colorOption) => (
                  <button
                    key={colorOption.id}
                    type="button"
                    onClick={() => {
                      if (editingFolderId === null) {
                        // General folder - save to localStorage with special key
                        const newColors = { ...folderColors, ["__general__"]: colorOption.id }
                        setFolderColors(newColors)
                        localStorage.setItem("vocablab_folder_colors", JSON.stringify(newColors))
                      } else {
                        updateFolderColor(editingFolderId, colorOption.id)
                      }
                    }}
                    className={cn(
                      "size-8 rounded-full transition-all",
                      colorOption.color,
                      (folderColors[editingFolderId || "__general__"] || "default") === colorOption.id
                        ? "ring-2 ring-offset-2 ring-foreground/30"
                        : "hover:scale-110"
                    )}
                    title={colorOption.label}
                  />
                ))}
              </div>
            </div>

            {/* Delete folder with card migration - only for regular folders */}
            {!isEditingReviewFolder && (
              <div className="space-y-3 pt-2 border-t border-border/30">
                <LongPressButton 
                  onLongPress={() => setShowDeleteConfirm(true)}
                  className="w-full h-10 rounded-md border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                  <span>Segure para excluir</span>
                </LongPressButton>
              </div>
            )}

            {!isEditingReviewFolder && (
              <div className="border-t border-border/30 pt-4">
                <Button variant="outline" className="h-12 w-full justify-between rounded-xl bg-muted/20 px-3 hover:bg-muted/45" onClick={() => { setTransferMode("all"); setTransferTag("all"); setTransferSelectedIds(new Set()); setTransferStreak(0); setTransferDestination(""); setTransferTrayOpen(true) }}>
                  <span className="flex items-center gap-2 font-medium"><span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><ArrowRightLeft className="size-3.5" /></span>Sistema de transferência</span>
                  <span className="text-[11px] text-muted-foreground">Filtrar e mover</span>
                </Button>
              </div>
            )}

            {/* Clear review folder - for review folders */}
            {isEditingReviewFolder && selectedReviewFolderId && (
              <div className="space-y-3 pt-2 border-t border-border/30">
                <Button 
                  variant="destructive" 
                  className="w-full gap-2"
                  onClick={async () => {
                    const cardsToClear = flashcards.filter(f => f.isReviewFolder && f.folderId === selectedReviewFolderId)
                    await Promise.all(cardsToClear.map(card => removeFromReviewFolder(card.id)))
                    toast({
                      title: "Review cleared",
                      description: `${cardsToClear.length} cards removed from review.`,
                    })
                    setIsRenameDialogOpen(false)
                  }}
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                  Clear review folder
                </Button>
              </div>
            )}

            {/* Transfer review cards to another review folder */}
            {isEditingReviewFolder && selectedReviewFolderId && (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <label className="text-[12px] font-medium text-muted-foreground">Transfer review cards to</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(reviewFoldersByParent)
                    .filter(id => id !== selectedReviewFolderId)
                    .map((parentFolderId) => {
                      const parentFolderName = parentFolderId === "__general__" 
                        ? generalFolderName 
                        : folders.find(f => f.id === parentFolderId)?.name || "Unknown"
                      return (
                        <button
                          key={parentFolderId}
                          type="button"
                          onClick={async () => {
                            // Only move review cards, not the parent folder
                            const cardsToMove = flashcards.filter(f => f.isReviewFolder && f.folderId === selectedReviewFolderId)
                            const moved = await Promise.all(cardsToMove.map(card => updateFlashcard({ ...card, folderId: parentFolderId === "__general__" ? null : parentFolderId })))
                            if (moved.some((success) => !success)) {
                              toast({ title: "Transfer incomplete", description: "Some review cards could not be transferred. Try again.", variant: "destructive" })
                              return
                            }
                            toast({
                              title: "Review cards transferred",
                              description: `${cardsToMove.length} review cards moved to "${parentFolderName}".`,
                            })
                            setIsRenameDialogOpen(false)
                          }}
                          className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground hover:border-border/60 hover:text-foreground transition-colors"
                        >
                          {reviewFolderTitle(parentFolderName, VOCAB_CURATED_FOLDER_NAMES)}
                        </button>
                      )
                    })}
                  {Object.keys(reviewFoldersByParent).filter(id => id !== selectedReviewFolderId).length === 0 && (
                    <p className="text-[11px] text-muted-foreground/60">No other review folders to transfer to.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Folder Confirmation Dialog ─────────────────── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-sm">
          <AlertDialogHeader className="pr-8">
            <AlertDialogTitle>Excluir pasta?</AlertDialogTitle>
            <AlertDialogDescription>
              {isEditingReviewFolder
                ? `Excluir a pasta de revisão de "${editingFolderName}"? Os cards originais serão preservados e apenas sairão da fila de Review.`
                : editingFolderId === null
                ? `Excluir a pasta "${generalFolderName}" e todos os seus cards?`
                : `Excluir a pasta "${editingFolderName}"? Escolha entre transferir ou apagar seus cards permanentemente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {/* Folder selection for moving cards - regular folders */}
          {editingFolderId !== null && !isEditingReviewFolder && (
            <FolderDeleteOptions label="O que deve acontecer com os cards?">
                {/* Other user folders */}
                {folders.filter(f => f.id !== editingFolderId).map((folder) => (
                  <FolderDeleteChoice
                    key={folder.id}
                    onClick={() => setDeleteTargetFolderId(folder.id)}
                    selected={deleteTargetFolderId === folder.id}
                  >
                    {folder.name}
                  </FolderDeleteChoice>
                ))}
                <FolderDeleteChoice
                  onClick={() => setDeleteTargetFolderId("__delete__")}
                  selected={deleteTargetFolderId === "__delete__"}
                  danger
                >
                  Apagar cards
                </FolderDeleteChoice>
            </FolderDeleteOptions>
          )}

          {/* Folder selection for moving review cards */}
          {isEditingReviewFolder && selectedReviewFolderId && (
            <FolderDeleteOptions label="Transferir cards de revisão para">
                {Object.keys(reviewFoldersByParent)
                  .filter(id => id !== selectedReviewFolderId)
                  .map((parentFolderId) => {
                    const parentFolderName = parentFolderId === "__general__" 
                      ? generalFolderName 
                      : folders.find(f => f.id === parentFolderId)?.name || "Unknown"
                    return (
                      <FolderDeleteChoice
                        key={parentFolderId}
                        onClick={() => setDeleteTargetFolderId(parentFolderId)}
                        selected={deleteTargetFolderId === parentFolderId}
                      >
                        {reviewFolderTitle(parentFolderName, VOCAB_CURATED_FOLDER_NAMES)}
                      </FolderDeleteChoice>
                    )
                  })}
                {Object.keys(reviewFoldersByParent).filter(id => id !== selectedReviewFolderId).length === 0 && (
                  <p className="text-[11px] text-muted-foreground/60">No other review folders. Cards will be removed from review.</p>
                )}
            </FolderDeleteOptions>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteConfirm(false); setDeleteTargetFolderId(null) }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={!isEditingReviewFolder && editingFolderId !== null && !deleteTargetFolderId}
              onClick={() => handleDeleteFolderWithMigration(editingFolderId, deleteTargetFolderId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
