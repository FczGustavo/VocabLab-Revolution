"use client"

import { useEffect, useMemo, useState } from "react"
import { GraduationCap, Languages, Loader2, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react"
import { useRegencyDB } from "@/hooks/use-regency-db"
import { useRegencyPreferences, type RegencyDisplayPreferences } from "@/hooks/use-regency-preferences"
import { useCardShape } from "@/hooks/use-card-shape"
import { useFolder } from "@/components/folder-context"
import { FolderCard, NewFolderCard } from "@/components/folder-card"
import { FolderDeleteChoice, FolderDeleteOptions } from "@/components/folder-delete-dialog"
import { LongPressButton } from "@/components/long-press-button"
import { RegencyStudyMode, type RegencyStudyKind } from "@/components/regency-study-mode"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { GrammaticalForm, RegencyCard, RegencyCategory, RegencyComplement, RegencyFolder } from "@/lib/types"
import { grammaticalFormLabels, grammaticalForms } from "@/lib/grammatical-forms"
import { GrammaticalFormBadge } from "@/components/grammatical-form-badge"
import { cn } from "@/lib/utils"
import { reviewFolderTitle } from "@/lib/review-folder-title"
import { REGENCY_DEFAULT_FOLDER_NAME } from "@/lib/regency-default-catalog"

const canUseRegencyMultipleChoice = (cards: RegencyCard[]) =>
  cards.length >= 10 && new Set(cards.map((card) => card.pattern.trim().toLocaleLowerCase("en-US")).filter(Boolean)).size >= 4

const gradients = ["default", "violet", "emerald", "amber"] as const
const complements: Array<{ id: RegencyComplement; label: string }> = [
  { id: "infinitive", label: "Infinitive" }, { id: "gerund", label: "Gerund" }, { id: "noun", label: "Noun" },
  { id: "clause", label: "Clause" }, { id: "prepositional-phrase", label: "Prepositional phrase" }, { id: "other", label: "Other" },
]
const folderColorOptions = [
  { id: "default", className: "bg-blue-400/50", label: "Blue" },
  { id: "violet", className: "bg-violet-400/30", label: "Violet" },
  { id: "emerald", className: "bg-emerald-400/30", label: "Green" },
  { id: "amber", className: "bg-amber-400/30", label: "Yellow" },
  { id: "rose", className: "bg-rose-400/30", label: "Rose" },
] as const

type EditorState = Pick<RegencyCard, "term" | "category" | "grammaticalForm" | "pattern" | "complement" | "example"> & { exampleTranslation: string; meaningPt: string; contrastPt: string }
const emptyEditor: EditorState = { term: "", category: "verb", grammaticalForm: "base-form", pattern: "", complement: "infinitive", example: "", exampleTranslation: "", meaningPt: "", contrastPt: "" }
type Suggestion = Pick<RegencyCard, "grammaticalForm" | "pattern" | "complement" | "example"> & { exampleTranslation: string; meaningPt: string; contrastPt: string }

function normalize(value: string) { return value.trim().toLocaleLowerCase("en-US") }

export function RegencyPage() {
  const { allCards, cards, reviewCards, folders, selectedFolderId, setSelectedFolderId, isLoading, addFolder, renameFolder, deleteFolder, addCard, updateCard, deleteCard, deleteCardsInFolder, moveCards, addToReviewFolder, removeFromReviewFolder } = useRegencyDB()
  const { showCategory, showGrammaticalForm, showMeaning, showContrast, showExample, showTranslation } = useRegencyPreferences()
  const { squareCards } = useCardShape()
  const { setIsInsideFolder, setGoBack, layout } = useFolder()
  const [generalFolderName, setGeneralFolderName] = useState("General")
  const [colors, setColors] = useState<Record<string, string>>({})
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [managerOpen, setManagerOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<RegencyFolder | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string>("__general__")
  const [editor, setEditor] = useState<EditorState>(emptyEditor)
  const [editingCard, setEditingCard] = useState<RegencyCard | null>(null)
  const [inputMode, setInputMode] = useState<"single" | "manual">("single")
  const [singleTerm, setSingleTerm] = useState("")
  const [singleGenerating, setSingleGenerating] = useState(false)
  const [singleResult, setSingleResult] = useState<{ created: number; skipped: number; rejected: number } | null>(null)
  const [search, setSearch] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [generatingExample, setGeneratingExample] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [studyKind, setStudyKind] = useState<RegencyStudyKind | null>(null)
  const [studyPickerOpen, setStudyPickerOpen] = useState(false)
  const [isReviewFolderSelected, setIsReviewFolderSelected] = useState(false)
  const [selectedReviewFolderId, setSelectedReviewFolderId] = useState<string | null>(null)

  const isInsideFolder = Boolean(selectedFolderId) || isReviewFolderSelected
  const isGeneral = selectedFolderId === "__general__"
  const sourceFolderName = selectedReviewFolderId === "__general__" ? generalFolderName : folders.find((folder) => folder.id === selectedReviewFolderId)?.name ?? "Folder"
  const currentFolderName = isReviewFolderSelected
    ? reviewFolderTitle(sourceFolderName, [REGENCY_DEFAULT_FOLDER_NAME])
    : isGeneral
      ? generalFolderName
      : folders.find((folder) => folder.id === selectedFolderId)?.name ?? "Folder"

  useEffect(() => {
    const loadPreferences = () => {
      const savedName = localStorage.getItem("regencylab_general_folder_name")
      const savedColors = localStorage.getItem("regencylab_folder_colors")
      if (savedName) setGeneralFolderName(savedName)
      if (savedColors) {
        try {
          const parsed = JSON.parse(savedColors) as Record<string, string>
          const normalized = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value === "blue" ? "default" : value]))
          setColors(normalized)
          if (JSON.stringify(parsed) !== JSON.stringify(normalized)) localStorage.setItem("regencylab_folder_colors", JSON.stringify(normalized))
        } catch { localStorage.removeItem("regencylab_folder_colors") }
      }
    }
    loadPreferences()
    window.addEventListener("regencylab-folder-colors-updated", loadPreferences)
    return () => window.removeEventListener("regencylab-folder-colors-updated", loadPreferences)
  }, [])
  useEffect(() => { setIsInsideFolder(isInsideFolder) }, [isInsideFolder, setIsInsideFolder])
  useEffect(() => {
    setGoBack(() => {
      setSelectedFolderId(null)
      setIsReviewFolderSelected(false)
      setSelectedReviewFolderId(null)
      setSearch("")
      setSuggestions([])
      setFormError(null)
    })
  }, [setGoBack, setSelectedFolderId])

  const setColor = (id: string, color: string) => {
    const next = { ...colors, [id]: color }
    setColors(next)
    localStorage.setItem("regencylab_folder_colors", JSON.stringify(next))
  }
  const gradientFor = (id: string, index: number) => (colors[id] ?? gradients[index % gradients.length]) as typeof gradients[number] | "blue" | "rose"
  const cardsInFolder = (id: string | null) => allCards.filter((card) => card.folderId === id)
  const reviewFoldersByParent = useMemo(() => reviewCards.reduce<Record<string, number>>((groups, card) => {
    const key = card.folderId ?? "__general__"
    groups[key] = (groups[key] ?? 0) + 1
    return groups
  }, {}), [reviewCards])
  const activeCards = isReviewFolderSelected
    ? reviewCards.filter((card) => (card.folderId ?? "__general__") === selectedReviewFolderId)
    : cards
  const displayedCards = useMemo(() => {
    const query = normalize(search)
    if (!query) return activeCards
    return activeCards.filter((card) => normalize(`${card.term} ${card.pattern} ${card.example} ${card.exampleTranslation ?? ""} ${card.meaningPt ?? ""} ${card.contrastPt ?? ""}`).includes(query))
  }, [activeCards, search])

  const openFolderManager = (folder: RegencyFolder | null) => {
    setEditingFolder(folder)
    setEditingFolderName(folder?.name ?? generalFolderName)
    setDeleteTarget("__general__")
    setManagerOpen(true)
  }
  const createFolder = async () => {
    const created = await addFolder(newFolderName)
    if (!created) return
    setNewFolderName("")
    setFolderDialogOpen(false)
  }
  const saveFolderName = async () => {
    const name = editingFolderName.trim()
    if (!name) return
    if (!editingFolder) {
      localStorage.setItem("regencylab_general_folder_name", name)
      setGeneralFolderName(name)
    } else {
      await renameFolder(editingFolder.id, name)
    }
    setManagerOpen(false)
  }
  const transferFolderCards = async (target: string) => {
    if (!editingFolder) return
    const moved = await moveCards(editingFolder.id, target === "__general__" ? null : target)
    if (!moved) { setFormError("Could not transfer the cards."); return }
    setManagerOpen(false)
  }
  const confirmDeleteFolder = async () => {
    if (!editingFolder) {
      const completed = deleteTarget === "__delete__"
        ? await deleteCardsInFolder(null)
        : deleteTarget ? await moveCards(null, deleteTarget) : false
      if (!completed) { setFormError("The folder operation failed without deleting the folder."); return }
    } else if (deleteTarget === "__delete__") {
      if (!await deleteCardsInFolder(editingFolder.id)) { setFormError("Could not delete the cards."); return }
      if (!await deleteFolder(editingFolder.id)) { setFormError("Cards were deleted, but the folder could not be removed."); return }
    } else {
      if (!await moveCards(editingFolder.id, deleteTarget === "__general__" ? null : deleteTarget)) { setFormError("Could not transfer the cards."); return }
      if (!await deleteFolder(editingFolder.id)) { setFormError("Cards were transferred, but the folder could not be removed."); return }
    }
    setDeleteOpen(false)
    setManagerOpen(false)
  }
  const resetEditor = () => { setEditor(emptyEditor); setEditingCard(null); setSuggestions([]); setFormError(null) }
  const saveCard = async () => {
    setFormError(null)
    if (editingCard) {
      const saved = await updateCard({ ...editingCard, ...editor })
      if (saved) resetEditor(); else setFormError("Could not update this card.")
      return
    }
    const result = await addCard(editor)
    if (result.ok) resetEditor(); else setFormError(result.error ?? "Could not save this card.")
  }
  const createSingleCards = async () => {
    const term = singleTerm.trim()
    if (!term) { setFormError("Write an English word first."); return }
    setSingleGenerating(true)
    setFormError(null)
    setSingleResult(null)
    try {
      const response = await fetch("/api/ai/regency-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "card", term }),
      })
      const data = await response.json()
      if (!response.ok || !data?.reviewed || !Array.isArray(data?.cards)) throw new Error(data?.error || "Could not create validated cards.")
      let created = 0
      let skipped = 0
      for (const generated of data.cards as Array<Omit<EditorState, "term">>) {
        const result = await addCard({ term, ...generated })
        if (result.ok) created++
        else skipped++
      }
      const rejected = typeof data.rejectedCount === "number" ? data.rejectedCount : 0
      if (created === 0) throw new Error(skipped ? "These constructions already exist in this folder." : "No reviewed construction could be saved.")
      setSingleTerm("")
      setSingleResult({ created, skipped, rejected })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create this card.")
    } finally {
      setSingleGenerating(false)
    }
  }
  const chooseSuggestion = (suggestion: Suggestion) => {
    setEditor((current) => ({ ...current, ...suggestion }))
    setSuggestions([])
    setFormError(null)
  }
  const requestSuggestion = async () => {
    if (!editor.term.trim()) { setFormError("Write the term before requesting a suggestion."); return }
    setSuggesting(true); setFormError(null)
    try {
      const familyPatterns = cards.filter((card) => normalize(card.term) === normalize(editor.term)).map((card) => card.pattern)
      const response = await fetch("/api/ai/regency-suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest", term: editor.term, category: editor.category, familyPatterns }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "Could not generate suggestions.")
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      if (!data.suggestions?.length) setFormError("No validated pattern was returned. You can still create the card manually.")
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not generate suggestions.") }
    finally { setSuggesting(false) }
  }
  const requestExample = async () => {
    if (!editor.term.trim() || !editor.pattern.trim()) { setFormError("Write the term and choose a pattern first."); return }
    setGeneratingExample(true); setFormError(null)
    try {
      const familyPatterns = cards.filter((card) => normalize(card.term) === normalize(editor.term)).map((card) => card.pattern)
      const response = await fetch("/api/ai/regency-suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "example", ...editor, familyPatterns }) })
      const data = await response.json()
      if (!response.ok || !data.compatible) throw new Error(data?.error || "The example could not be validated.")
      setEditor((current) => ({ ...current, grammaticalForm: data.suggestion.grammaticalForm ?? current.grammaticalForm, example: data.suggestion.example, exampleTranslation: data.suggestion.exampleTranslation ?? "", meaningPt: data.suggestion.meaningPt ?? "", contrastPt: data.suggestion.contrastPt ?? "" }))
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not generate an example.") }
    finally { setGeneratingExample(false) }
  }
  const beginEdit = (card: RegencyCard) => { setInputMode("manual"); setEditingCard(card); setEditor({ ...card, exampleTranslation: card.exampleTranslation ?? "", meaningPt: card.meaningPt ?? "", contrastPt: card.contrastPt ?? "" }); setSuggestions([]); setSingleResult(null); setFormError(null); window.scrollTo({ top: 0, behavior: "smooth" }) }

  if (studyKind) return <RegencyStudyMode cards={activeCards} folderName={currentFolderName} mode={studyKind} display={{ showCategory, showGrammaticalForm, showMeaning, showContrast, showExample, showTranslation }} onMarkForReview={isReviewFolderSelected ? undefined : addToReviewFolder} onMarkAsLearned={removeFromReviewFolder} onExit={() => setStudyKind(null)} />

  return (
    <div className="w-full">
      {!isInsideFolder && (
        <>
          <div className="mb-20 flex flex-col items-center gap-6 pt-4 sm:mb-16 sm:pt-6"><h1 className="lab-title select-none font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">RegencyLab</h1></div>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <FolderCard name={generalFolderName} wordCount={cardsInFolder(null).length} subtitle={`${cardsInFolder(null).length} regency cards`} gradient={gradientFor("__general__", 0)} onClick={() => { setIsReviewFolderSelected(false); setSelectedReviewFolderId(null); setSelectedFolderId("__general__") }} onSettings={() => openFolderManager(null)} />
            {folders.map((folder, index) => <FolderCard key={folder.id} name={folder.name} wordCount={cardsInFolder(folder.id).length} subtitle={`${cardsInFolder(folder.id).length} regency cards`} gradient={gradientFor(folder.id, index + 1)} onClick={() => { setIsReviewFolderSelected(false); setSelectedReviewFolderId(null); setSelectedFolderId(folder.id) }} onSettings={() => openFolderManager(folder)} />)}
            <NewFolderCard onClick={() => { setNewFolderName(""); setFolderDialogOpen(true) }} />
          </div>
          {Object.keys(reviewFoldersByParent).length > 0 && <>
            <div className="my-5 border-t border-border/30" />
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(reviewFoldersByParent).map(([parentFolderId, count]) => {
              const parentName = parentFolderId === "__general__" ? generalFolderName : folders.find((folder) => folder.id === parentFolderId)?.name ?? "Folder"
              return <FolderCard key={`review-${parentFolderId}`} name={reviewFolderTitle(parentName, [REGENCY_DEFAULT_FOLDER_NAME])} wordCount={count} subtitle={`${count} ${count === 1 ? "card" : "cards"} to review`} gradient="amber" isReview onClick={() => { setSelectedFolderId(null); setSelectedReviewFolderId(parentFolderId); setIsReviewFolderSelected(true) }} />
            })}
            </div>
          </>}
        </>
      )}

      {isInsideFolder && (
        <>
          <div className="mb-8 flex flex-col items-center gap-6 pt-4 sm:mb-10 sm:pt-6"><h1 className="lab-title select-none font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">RegencyLab</h1></div>
          {!isReviewFolderSelected && <div className="mx-auto w-full max-w-md">
            <section className="relative rounded-2xl border border-border/40 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm">
              <form onSubmit={(event) => { event.preventDefault(); if (inputMode === "single") void createSingleCards(); else void saveCard() }} className="space-y-0">
                <div className="px-1">
                  {inputMode === "single" ? <Input value={singleTerm} onChange={(event) => setSingleTerm(event.target.value)} placeholder="Type an English word" disabled={singleGenerating} className="h-8 w-full border-0 bg-transparent px-0 text-[13px] placeholder:text-[13px] placeholder:text-muted-foreground/40 shadow-none focus-visible:ring-0" autoComplete="off" /> : <div className="flex h-8 items-center text-[13px] text-muted-foreground/40">Manual active</div>}
                </div>
                <div className="flex items-center justify-between px-1 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => { setInputMode("single"); setEditingCard(null); setSuggestions([]); setSingleResult(null); setFormError(null) }} className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200", inputMode === "single" ? "bg-foreground/5 text-foreground/80" : "text-muted-foreground/50 hover:text-muted-foreground")}>Single</button>
                    <button type="button" onClick={() => { setInputMode("manual"); setSingleResult(null); setFormError(null) }} className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200", inputMode === "manual" ? "bg-foreground/5 text-foreground/80" : "text-muted-foreground/50 hover:text-muted-foreground")}>Manual</button>
                  </div>
                  <Button type="submit" size="icon" disabled={inputMode === "single" ? !singleTerm.trim() || singleGenerating : !editor.term.trim() || !editor.pattern.trim() || !editor.example.trim()} className="size-7 shrink-0 rounded-full bg-primary/80 shadow-sm transition-all hover:bg-primary hover:shadow-md">{singleGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}</Button>
                </div>
              </form>

              {formError && <p className="mt-3 px-1 text-[12px] text-destructive">{formError}</p>}
              {singleResult && <p className="mt-3 px-1 text-[12px] text-muted-foreground">Created {singleResult.created} {singleResult.created === 1 ? "card" : "cards"}{singleResult.rejected ? ` · ${singleResult.rejected} not approved by review` : ""}{singleResult.skipped ? ` · ${singleResult.skipped} already existed` : ""}.</p>}

              <div className={cn("grid transition-[grid-template-rows,margin,opacity] duration-300 ease-out", inputMode === "manual" ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0 pointer-events-none")}>
                <div className="overflow-hidden">
                  <div className={cn("rounded-2xl border border-border/50 bg-background/45 p-3.5 shadow-sm transition-transform duration-300 sm:p-4", inputMode === "manual" ? "translate-y-0" : "-translate-y-2")}>
                    <div className="mb-3 flex items-center justify-between gap-3">{editingCard ? <p className="text-xs text-muted-foreground">Editing this construction</p> : <p className="text-xs text-muted-foreground">Write every field yourself, or use optional suggestions.</p>}{editingCard && <Button type="button" variant="ghost" size="sm" onClick={resetEditor}>Cancel edit</Button>}</div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                      <Field label="Term"><Input value={editor.term} onChange={(event) => setEditor((current) => ({ ...current, term: event.target.value }))} placeholder="e.g. struggle" /></Field>
                      <Field label="Category"><select value={editor.category} onChange={(event) => setEditor((current) => ({ ...current, category: event.target.value as RegencyCategory }))} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="verb">Verb</option><option value="adjective">Adjective</option><option value="noun">Noun</option></select></Field>
                      <Field label="Grammatical form"><select value={editor.grammaticalForm ?? "base-form"} onChange={(event) => setEditor((current) => ({ ...current, grammaticalForm: event.target.value as GrammaticalForm }))} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{grammaticalForms.map((form) => <option key={form} value={form}>{grammaticalFormLabels[form]}</option>)}</select></Field>
                      <Field label="Pattern"><Input value={editor.pattern} onChange={(event) => setEditor((current) => ({ ...current, pattern: event.target.value }))} placeholder="e.g. to + infinitive" /></Field>
                      <Field label="Complement"><select value={editor.complement} onChange={(event) => setEditor((current) => ({ ...current, complement: event.target.value as RegencyComplement }))} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{complements.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                    </div>
                    <div className="mt-3"><Field label="Example"><Textarea value={editor.example} onChange={(event) => setEditor((current) => ({ ...current, example: event.target.value }))} placeholder="e.g. I struggle to balance work and family commitments." className="min-h-20 resize-y" /></Field></div>
                    <div className="mt-3"><Field label="Example translation (PT-BR)"><Textarea value={editor.exampleTranslation} onChange={(event) => setEditor((current) => ({ ...current, exampleTranslation: event.target.value }))} placeholder="e.g. Eu luto para equilibrar o trabalho e os compromissos familiares." className="min-h-16 resize-y" /></Field></div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Meaning (PT-BR)"><Textarea value={editor.meaningPt} onChange={(event) => setEditor((current) => ({ ...current, meaningPt: event.target.value }))} placeholder="Quando e por que usar esta construção." className="min-h-20 resize-y" /></Field><Field label="Contrast (PT-BR, optional)"><Textarea value={editor.contrastPt} onChange={(event) => setEditor((current) => ({ ...current, contrastPt: event.target.value }))} placeholder="Diferença para outros padrões da mesma palavra." className="min-h-20 resize-y" /></Field></div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/30 pt-4"><Button type="button" variant="outline" size="sm" onClick={requestSuggestion} disabled={suggesting}>{suggesting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Sparkles className="mr-1.5 size-3.5" />}Suggest patterns</Button><Button type="button" variant="outline" size="sm" onClick={requestExample} disabled={generatingExample}>{generatingExample ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Sparkles className="mr-1.5 size-3.5" />}Generate example</Button><Button type="button" size="sm" className="ml-auto" onClick={saveCard}>{editingCard ? "Save changes" : "Create card"}</Button></div>
                    {suggestions.length > 0 && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">Review a suggested pattern</p><div className="space-y-2">{suggestions.map((suggestion, index) => <button key={`${suggestion.pattern}-${index}`} type="button" onClick={() => chooseSuggestion(suggestion)} className="w-full rounded-lg border border-border/40 bg-background p-3 text-left transition-colors hover:border-primary/30"><p className="text-sm font-medium text-foreground/80">{suggestion.pattern}</p><p className="mt-1 text-xs text-foreground/70">{suggestion.meaningPt}</p>{suggestion.contrastPt && <p className="mt-1 text-[11px] text-primary/75"><span className="font-semibold">Compare:</span> {suggestion.contrastPt}</p>}<p className="mt-2 text-xs italic text-muted-foreground">“{suggestion.example}”</p><p className="mt-1 text-xs text-muted-foreground/75">{suggestion.exampleTranslation}</p></button>)}</div></div>}
                  </div>
                </div>
              </div>
            </section>
          </div>}

          <section className="mt-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className={cn("flex h-9 min-w-0 items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-0 shadow-sm", layout === "list" && "w-full", layout === "grid" && "w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]", layout === "compact" && "w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/4)] xl:w-[calc((100%-4rem)/5)]")}><Search className="size-4 shrink-0 text-muted-foreground/60" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by term, pattern or example" className="h-6 border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus-visible:ring-0" /></div><Button size="sm" variant="outline" onClick={() => setStudyPickerOpen(true)} disabled={!activeCards.length} className="h-9 gap-1.5 rounded-full px-3 text-[13px]"><GraduationCap className="size-3.5" />Study in <span className="font-medium text-blue-600 dark:text-blue-400">{currentFolderName}</span> as {activeCards.length} cards</Button></div>
            {isLoading ? <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : displayedCards.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">{activeCards.length ? "No cards match your search." : isReviewFolderSelected ? "No cards to review." : "Create the first pattern for this folder."}</p> : <div className={cn("mt-6", layout === "grid" ? "grid items-start grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3")}>{displayedCards.map((card) => <RegencyCardView key={card.id} card={card} layout={layout} squareCards={squareCards} display={{ showCategory, showGrammaticalForm, showMeaning, showContrast, showExample, showTranslation }} onEdit={() => beginEdit(card)} onDelete={() => void deleteCard(card.id)} />)}</div>}
          </section>
        </>
      )}

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}><DialogContent><DialogHeader><DialogTitle>Create New Folder</DialogTitle><DialogDescription>Organize cards by topic, level or personal goal.</DialogDescription></DialogHeader><Input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createFolder()} placeholder="Folder name" /><DialogFooter><Button onClick={() => void createFolder()} disabled={!newFolderName.trim()}>Create folder</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="min-h-[360px] max-w-[92vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Folder</DialogTitle>
            <DialogDescription>{editingFolder ? `Manage folder "${editingFolder.name}".` : `Manage the "${generalFolderName}" folder.`}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Folder name</label>
              <div className="flex gap-2">
                <Input value={editingFolderName} onChange={(event) => setEditingFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveFolderName()} placeholder="Folder name" />
                <Button variant="outline" onClick={() => void saveFolderName()} disabled={!editingFolderName.trim()}>Rename</Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Folder color</label>
              <div className="flex gap-2">
                {folderColorOptions.map((color) => {
                  const folderKey = editingFolder?.id ?? "__general__"
                  const active = (colors[folderKey] ?? "default") === color.id
                  return <button key={color.id} type="button" onClick={() => setColor(folderKey, color.id)} title={color.label} aria-label={`${color.label} folder color`} className={cn("size-8 rounded-full transition-all", color.className, active ? "ring-2 ring-offset-2 ring-foreground/30" : "hover:scale-110")} />
                })}
              </div>
            </div>
            <div className="space-y-3 border-t border-border/30 pt-2">
              <LongPressButton onLongPress={() => { setDeleteTarget(editingFolder ? "__general__" : "__delete__"); setDeleteOpen(true) }} className="h-10 w-full rounded-md border border-destructive/20 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10">
                <Trash2 className="size-4 text-muted-foreground" />
                <span>Hold to delete</span>
              </LongPressButton>
            </div>
            {editingFolder && <div className="space-y-2 border-t border-border/30 pt-2">
              <label className="text-[12px] font-medium text-muted-foreground">Transfer all cards to</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void transferFolderCards("__general__")} className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground">{generalFolderName}</button>
                {folders.filter((folder) => folder.id !== editingFolder.id).map((folder) => <button key={folder.id} type="button" onClick={() => void transferFolderCards(folder.id)} className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground">{folder.name}</button>)}
              </div>
            </div>}
            {!editingFolder && folders.length > 0 && <div className="space-y-2 border-t border-border/30 pt-2">
              <label className="text-[12px] font-medium text-muted-foreground">Transfer all cards to</label>
              <div className="flex flex-wrap gap-2">
                {folders.map((folder) => <button key={folder.id} type="button" onClick={async () => { await moveCards(null, folder.id); setManagerOpen(false) }} className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground">{folder.name}</button>)}
              </div>
            </div>}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-sm">
          <AlertDialogHeader className="pr-8">
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>{editingFolder ? `Delete "${editingFolder.name}"? Choose whether to move or permanently delete its cards.` : `Delete "${generalFolderName}" folder and all its cards?`}</AlertDialogDescription>
          </AlertDialogHeader>
          <FolderDeleteOptions label="What should happen to its cards?">
            {editingFolder && <FolderDeleteChoice onClick={() => setDeleteTarget("__general__")} selected={deleteTarget === "__general__"}>{generalFolderName}</FolderDeleteChoice>}
            {folders.filter((folder) => folder.id !== editingFolder?.id).map((folder) => <FolderDeleteChoice key={folder.id} onClick={() => setDeleteTarget(folder.id)} selected={deleteTarget === folder.id}>{folder.name}</FolderDeleteChoice>)}
            <FolderDeleteChoice onClick={() => setDeleteTarget("__delete__")} selected={deleteTarget === "__delete__"} danger>Delete cards</FolderDeleteChoice>
          </FolderDeleteOptions>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget("__general__")}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => void confirmDeleteFolder()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={studyPickerOpen} onOpenChange={setStudyPickerOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Start study</DialogTitle><DialogDescription>Choose how you want to review this folder.</DialogDescription></DialogHeader><div className="grid gap-2"><Button variant="outline" disabled={!canUseRegencyMultipleChoice(activeCards)} className="h-auto justify-start p-4 text-left" onClick={() => { setStudyPickerOpen(false); setStudyKind("choice") }}><span><span className="block text-sm">Multiple choice</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{canUseRegencyMultipleChoice(activeCards) ? "Choose the construction that completes each context." : "Requires at least 10 cards and 4 distinct answers."}</span></span></Button><Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => { setStudyPickerOpen(false); setStudyKind("recall") }}><span><span className="block text-sm">Active recall</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Try to remember the pattern before revealing it.</span></span></Button><Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => { setStudyPickerOpen(false); setStudyKind("flip") }}><span><span className="block text-sm">Flip cards</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Turn the card and mark whether you knew it.</span></span></Button></div></DialogContent></Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label> }

function RegencyCardView({ card, layout, squareCards, display, onEdit, onDelete }: { card: RegencyCard; layout: "grid" | "list" | "compact"; squareCards: boolean; display: RegencyDisplayPreferences; onEdit: () => void; onDelete: () => void }) {
  const [translationVisible, setTranslationVisible] = useState(false)
  const contrast = card.contrastPt?.replace(/^compare:\s*/i, "").trim()
  return (
    <article className={cn("group relative self-start rounded-[20px] border border-border/40 bg-card p-4 shadow-sm sm:rounded-[22px]", layout === "grid" && "flex w-full flex-col overflow-hidden sm:p-6", layout === "grid" && (squareCards ? "aspect-square h-auto" : "h-[19rem] sm:h-80"), layout === "compact" && "rounded-xl py-3")}>
      <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {layout !== "compact" && display.showTranslation && card.exampleTranslation && <Button variant="ghost" size="icon-sm" className={cn("text-muted-foreground", translationVisible && "bg-primary/10 text-primary")} onClick={() => setTranslationVisible((value) => !value)} title="Toggle example translation"><Languages className="size-3.5" /></Button>}
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onEdit} title="Edit card"><Pencil className="size-3.5" /></Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-muted hover:text-muted-foreground" onClick={onDelete} title="Delete card"><Trash2 className="size-3.5" /></Button>
      </div>

      <div className={cn("min-w-0 pr-24", layout === "grid" && "border-b border-border/35 pb-3")}>
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate text-xl font-medium tracking-tight text-foreground/80">{card.term}</h3>
          {(display.showCategory || display.showGrammaticalForm) && (
            <div className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
              {display.showCategory && <span className={cn("ghost-tag inline-flex h-5 w-fit shrink-0 items-center justify-center whitespace-nowrap px-2 py-0.5 text-[10px] font-medium leading-none", card.category === "verb" ? "bg-blue-500/10 text-blue-700 dark:bg-blue-700 dark:text-white/90" : card.category === "noun" ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-700 dark:text-white/90" : "bg-amber-500/10 text-amber-700 dark:bg-amber-700 dark:text-white/90")}>{card.category === "verb" ? "Verb" : card.category === "noun" ? "Noun" : "Adjective"}</span>}
              {display.showGrammaticalForm && <GrammaticalFormBadge form={card.grammaticalForm} />}
            </div>
          )}
        </div>
        <p className="mt-3 text-sm font-medium text-foreground/75">{card.pattern}</p>
      </div>

      {layout === "grid" && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 scrollbar-hide">
          <div className="space-y-2">
            {display.showMeaning && card.meaningPt && <p className="text-sm leading-relaxed text-foreground/70">{card.meaningPt}</p>}
            {display.showContrast && contrast && <p className="context-bubble rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-primary/80">Compare:</span> {contrast}</p>}
          </div>
          <div className="mt-auto pt-3">
            {display.showExample && <div className="border-t border-border/35 pt-3"><p className="line-clamp-2 min-h-12 text-sm italic leading-relaxed text-muted-foreground">“{card.example}”</p></div>}
            {display.showTranslation && <div className="min-h-10 pt-2">{translationVisible && card.exampleTranslation && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">{card.exampleTranslation}</p>}</div>}
          </div>
        </div>
      )}

      {layout === "list" && <div className="mt-3 space-y-2">{display.showMeaning && card.meaningPt && <p className="text-sm leading-relaxed text-foreground/70">{card.meaningPt}</p>}{display.showContrast && contrast && <p className="context-bubble rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-primary/80">Compare:</span> {contrast}</p>}{display.showExample && <p className="text-sm italic leading-relaxed text-muted-foreground">“{card.example}”</p>}{display.showTranslation && <div className="mt-3 min-h-14 border-t border-border/35 pt-2">{translationVisible && card.exampleTranslation && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">{card.exampleTranslation}</p>}</div>}</div>}
    </article>
  )
}
