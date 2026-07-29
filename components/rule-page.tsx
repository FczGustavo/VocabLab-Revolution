"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, GraduationCap, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useRuleDB } from "@/hooks/use-rule-db"
import { useCardShape } from "@/hooks/use-card-shape"
import { useFolder } from "@/components/folder-context"
import { FolderCard, NewFolderCard } from "@/components/folder-card"
import { FolderDeleteChoice, FolderDeleteOptions } from "@/components/folder-delete-dialog"
import { LongPressButton } from "@/components/long-press-button"
import { RuleStudyMode, type RuleStudyKind } from "@/components/rule-study-mode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import type { RuleCard, RuleFolder } from "@/lib/types"

const colorOptions = ["default", "violet", "emerald", "amber", "rose"] as const
type FolderColor = typeof colorOptions[number]
const colorClass: Record<FolderColor, string> = { default: "bg-blue-400/50", violet: "bg-violet-400/50", emerald: "bg-emerald-400/50", amber: "bg-amber-400/50", rose: "bg-rose-400/50" }

export function RulePage() {
  const { allCards, cards, reviewCards, folders, selectedFolderId, setSelectedFolderId, isLoading, addFolder, renameFolder, deleteFolder, addCard, updateCard, deleteCard, deleteCardsInFolder, moveCards, addToReviewFolder, removeFromReviewFolder } = useRuleDB()
  const { setIsInsideFolder, setGoBack, layout } = useFolder()
  const { squareCards } = useCardShape()
  const [isReviewSelected, setIsReviewSelected] = useState(false)
  const [selectedReviewFolderId, setSelectedReviewFolderId] = useState<string | null>(null)
  const [colors, setColors] = useState<Record<string, FolderColor>>({})
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [managerFolder, setManagerFolder] = useState<RuleFolder | null>(null)
  const [managerName, setManagerName] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState<"transfer" | "delete">("transfer")
  const [transferTarget, setTransferTarget] = useState("")
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<RuleCard | null>(null)
  const [front, setFront] = useState("")
  const [back, setBack] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [studyPickerOpen, setStudyPickerOpen] = useState(false)
  const [studyKind, setStudyKind] = useState<RuleStudyKind | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    try { setColors(JSON.parse(localStorage.getItem("rulelab_folder_colors") ?? "{}")) } catch { setColors({}) }
  }, [])
  const setColor = (id: string, color: FolderColor) => {
    setColors((current) => { const next = { ...current, [id]: color }; localStorage.setItem("rulelab_folder_colors", JSON.stringify(next)); return next })
  }
  const inside = Boolean(selectedFolderId) || isReviewSelected
  useEffect(() => {
    setIsInsideFolder(inside)
    setGoBack(() => { setSelectedFolderId(null); setIsReviewSelected(false); setSelectedReviewFolderId(null); setSearch("") })
    return () => setIsInsideFolder(false)
  }, [inside, setGoBack, setIsInsideFolder, setSelectedFolderId])

  const activeCards = isReviewSelected ? reviewCards.filter((card) => !selectedReviewFolderId || card.folderId === selectedReviewFolderId) : cards
  const reviewParent = folders.find((folder) => folder.id === selectedReviewFolderId)
  const currentName = isReviewSelected ? `Review of \"${reviewParent?.name ?? "Rules"}\"` : folders.find((folder) => folder.id === selectedFolderId)?.name ?? "RuleLab"
  const filteredCards = useMemo(() => activeCards.filter((card) => `${card.front} ${card.back}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [activeCards, search])

  const openEditor = (card?: RuleCard) => { setEditingCard(card ?? null); setFront(card?.front ?? ""); setBack(card?.back ?? ""); setFormError(null); setEditorOpen(true) }
  const saveCard = async () => {
    if (editingCard) {
      if (await updateCard({ ...editingCard, front, back })) setEditorOpen(false)
      else setFormError("Complete both sides of the card.")
      return
    }
    const result = await addCard(front, back)
    if (result.ok) setEditorOpen(false); else setFormError(result.error ?? "Could not save this card.")
  }
  const createFolder = async () => { const folder = await addFolder(folderName); if (folder) { setFolderDialogOpen(false); setFolderName("") } }
  const saveFolder = async () => { if (managerFolder && await renameFolder(managerFolder.id, managerName)) setManagerFolder(null) }
  const performFolderDelete = async () => {
    if (!managerFolder) return
    const cardsHandled = deleteMode === "transfer" && transferTarget
      ? await moveCards(managerFolder.id, transferTarget)
      : deleteMode === "delete"
        ? await deleteCardsInFolder(managerFolder.id)
        : false
    if (!cardsHandled) { setFormError("The cards could not be moved or deleted. The folder was preserved."); return }
    if (!await deleteFolder(managerFolder.id)) { setFormError("The cards were processed, but the folder could not be deleted."); return }
    setDeleteOpen(false); setManagerFolder(null)
  }
  const transferAndDeleteFolder = async (targetFolderId: string) => {
    if (!managerFolder) return
    if (!await moveCards(managerFolder.id, targetFolderId)) { setFormError("The cards could not be transferred."); return }
    if (!await deleteFolder(managerFolder.id)) { setFormError("The cards were transferred, but the folder could not be deleted."); return }
    setManagerFolder(null)
  }
  const openFolder = (id: string) => { setSelectedFolderId(id); setIsReviewSelected(false); setSelectedReviewFolderId(null); setSearch("") }
  const startStudy = (kind: RuleStudyKind) => { setStudyPickerOpen(false); setStudyKind(kind) }

  if (studyKind) return <RuleStudyMode cards={activeCards} folderName={currentName} mode={studyKind} onExit={() => setStudyKind(null)} onMarkForReview={isReviewSelected ? undefined : addToReviewFolder} onMarkAsLearned={isReviewSelected ? removeFromReviewFolder : undefined} />

  return <div className="w-full">
    {!inside ? <>
      <div className="mb-20 flex flex-col items-center gap-6 pt-4 sm:mb-16 sm:pt-6"><h1 className="lab-title select-none text-center font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">RuleLab</h1></div>
      {isLoading ? <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {folders.map((folder) => <FolderCard key={folder.id} name={folder.name} wordCount={allCards.filter((card) => card.folderId === folder.id).length} gradient={colors[folder.id] ?? "default"} subtitle={`${allCards.filter((card) => card.folderId === folder.id).length} rule cards`} onClick={() => openFolder(folder.id)} onSettings={() => { setManagerFolder(folder); setManagerName(folder.name) }} />)}
        <NewFolderCard onClick={() => setFolderDialogOpen(true)} />
      </div>}
      {reviewCards.length > 0 && <><div className="my-5 border-t border-border/30" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{folders.filter((folder) => reviewCards.some((card) => card.folderId === folder.id)).map((folder) => { const count = reviewCards.filter((card) => card.folderId === folder.id).length; return <FolderCard key={`review-${folder.id}`} name={`Review of \"${folder.name}\"`} wordCount={count} isReview gradient="amber" subtitle={`${count} cards to review`} onClick={() => { setIsReviewSelected(true); setSelectedFolderId(null); setSelectedReviewFolderId(folder.id); setSearch("") }} /> })}</div></>}
      {!isLoading && folders.length === 0 && <p className="mt-6 text-center text-sm text-muted-foreground">Create a folder to start organizing your rules.</p>}
    </> : <>
      <div className="mb-8 flex flex-col items-center gap-6 pt-4 sm:mb-10 sm:pt-6"><h1 className="lab-title select-none text-center font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">RuleLab</h1></div>
      <div className="mt-4 space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className={cn("flex h-9 min-w-0 items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-0 shadow-sm", layout === "list" ? "w-full" : "w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]")}><Search className="size-4 shrink-0 text-muted-foreground/60" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by front or back" className="h-6 border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus-visible:ring-0" /></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openEditor()} disabled={isReviewSelected} className="h-9 gap-1.5 rounded-full px-3 text-[13px]"><Plus className="size-3.5" />Add card</Button><Button size="sm" variant="outline" onClick={() => setStudyPickerOpen(true)} disabled={!activeCards.length} className="h-9 gap-1.5 rounded-full px-3 text-[13px]"><GraduationCap className="size-3.5" />Study in <span className="font-medium text-blue-600 dark:text-blue-400">{currentName}</span> as {activeCards.length} cards</Button></div></div></div>
      <div className={cn("mt-6 grid gap-4", layout === "list" ? "grid-cols-1" : layout === "compact" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
        {filteredCards.map((card) => <RuleCardView key={card.id} card={card} layout={layout} squareCards={squareCards} onEdit={() => openEditor(card)} onDelete={() => void deleteCard(card.id)} />)}
      </div>
    </>}

    <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader><Input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createFolder()} placeholder="e.g. Irregular plurals" /><DialogFooter><Button onClick={() => void createFolder()} disabled={!folderName.trim()}>Create folder</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editingCard ? "Edit card" : "Add rule card"}</DialogTitle></DialogHeader><div className="space-y-4"><label className="block text-sm font-medium">Front<Textarea value={front} onChange={(event) => setFront(event.target.value)} className="mt-1.5 min-h-24" placeholder="Rule, question or prompt" /></label><label className="block text-sm font-medium">Back<Textarea value={back} onChange={(event) => setBack(event.target.value)} className="mt-1.5 min-h-28" placeholder="Answer, explanation or example" /></label>{formError && <p className="text-sm text-destructive">{formError}</p>}</div><DialogFooter><Button onClick={() => void saveCard()}>{editingCard ? "Save changes" : "Add card"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={studyPickerOpen} onOpenChange={setStudyPickerOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Start study</DialogTitle></DialogHeader><div className="grid gap-2"><Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => startStudy("recall")}><span><span className="block text-sm">Active Recall</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Write an answer before revealing the back.</span></span></Button><Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => startStudy("flip")}><span><span className="block text-sm">Flip Cards</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Turn the card and rate whether you knew it.</span></span></Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(managerFolder)} onOpenChange={(open) => !open && setManagerFolder(null)}><DialogContent className="max-w-[92vw] sm:max-w-sm"><DialogHeader><DialogTitle>Manage Folder</DialogTitle><p className="text-sm text-muted-foreground">Manage the “{managerFolder?.name}” folder.</p></DialogHeader><div className="mt-2 space-y-4"><div className="space-y-2"><label className="text-[12px] font-medium text-muted-foreground">Folder name</label><div className="flex gap-2"><Input value={managerName} onChange={(event) => setManagerName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveFolder()} /><Button variant="outline" onClick={() => void saveFolder()} disabled={!managerName.trim()}>Rename</Button></div></div><div className="space-y-2"><label className="text-[12px] font-medium text-muted-foreground">Folder color</label><div className="flex gap-2">{colorOptions.map((color) => <button key={color} type="button" onClick={() => managerFolder && setColor(managerFolder.id, color)} className={cn("size-8 rounded-full transition-all", colorClass[color], colors[managerFolder?.id ?? ""] === color ? "ring-2 ring-offset-2 ring-foreground/30" : "hover:scale-110")} aria-label={color} />)}</div></div><div className="space-y-3 border-t border-border/30 pt-2"><LongPressButton onLongPress={() => { setDeleteMode("transfer"); setTransferTarget(""); setDeleteOpen(true) }} className="h-10 w-full rounded-md border border-destructive/20 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="size-4 text-muted-foreground" /><span>Hold to delete</span></LongPressButton></div>{managerFolder && folders.filter((folder) => folder.id !== managerFolder.id).length > 0 && <div className="space-y-2 border-t border-border/30 pt-2"><label className="text-[12px] font-medium text-muted-foreground">Transfer all cards to</label><div className="flex flex-wrap gap-2">{folders.filter((folder) => folder.id !== managerFolder.id).map((folder) => <button key={folder.id} type="button" onClick={() => void transferAndDeleteFolder(folder.id)} className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground">{folder.name}</button>)}</div></div>}</div></DialogContent></Dialog>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent className="max-w-[92vw] sm:max-w-sm">
        <AlertDialogHeader className="pr-8">
          <AlertDialogTitle>Delete folder?</AlertDialogTitle>
          <AlertDialogDescription>Delete “{managerFolder?.name}”? Choose whether to move or permanently delete its cards.</AlertDialogDescription>
        </AlertDialogHeader>
        <FolderDeleteOptions label="What should happen to its cards?">
          {folders.filter((folder) => folder.id !== managerFolder?.id).map((folder) => (
            <FolderDeleteChoice
              key={folder.id}
              onClick={() => {
                setDeleteMode("transfer")
                setTransferTarget(folder.id)
              }}
              selected={deleteMode === "transfer" && transferTarget === folder.id}
            >
              {folder.name}
            </FolderDeleteChoice>
          ))}
          <FolderDeleteChoice
            onClick={() => setDeleteMode("delete")}
            selected={deleteMode === "delete"}
            danger
          >
            Delete cards
          </FolderDeleteChoice>
        </FolderDeleteOptions>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setDeleteMode("transfer"); setTransferTarget("") }}>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => void performFolderDelete()} disabled={deleteMode === "transfer" && !transferTarget}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}

function RuleCardView({ card, layout, squareCards, onEdit, onDelete }: { card: RuleCard; layout: "grid" | "list" | "compact"; squareCards: boolean; onEdit: () => void; onDelete: () => void }) {
  return <article className={cn(
    "group relative self-start rounded-[20px] border border-border/40 bg-card p-4 shadow-sm transition-all hover:border-primary/20 hover:shadow-md sm:rounded-[22px]",
    layout === "grid" && "flex w-full flex-col overflow-hidden sm:p-6",
    layout === "grid" && (squareCards ? "aspect-square h-auto" : "h-[19rem] sm:h-80"),
    layout === "list" && "flex min-h-28 w-full flex-row items-center gap-6",
    layout === "compact" && "rounded-xl py-3",
  )}>
    <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onEdit} title="Edit card"><Pencil className="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-muted hover:text-muted-foreground" onClick={onDelete} title="Delete card"><Trash2 className="size-3.5" /></Button>
    </div>
    <div className={cn("min-w-0 pr-20", layout === "grid" && "border-b border-border/35 pb-3")}>
      <h3 className="whitespace-pre-wrap text-xl font-medium leading-snug tracking-tight text-foreground/80">{card.front}</h3>
    </div>
    {layout === "grid" ? <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 scrollbar-hide"><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{card.back}</p></div> : layout === "list" ? <p className="line-clamp-2 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{card.back}</p> : <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{card.back}</p>}
  </article>
}
