"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Loader2, Search, X, Trash2, Image, FileText, Tag } from "lucide-react"
import { useReadlabDB } from "@/hooks/use-readlab-db"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useFolder } from "@/components/folder-context"
import { FolderCard, NewFolderCard } from "@/components/folder-card"
import { FolderDeleteChoice, FolderDeleteOptions } from "@/components/folder-delete-dialog"
import { TextCard } from "@/components/text-card"
import { ReadTextView } from "@/components/read-text-view"
import { LongPressButton } from "@/components/long-press-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { ReadLabText, ReadLabTag } from "@/lib/types"
import { READLAB_TAG_LABELS, READLAB_TAG_COLORS } from "@/lib/types"

const ALL_TAGS: ReadLabTag[] = ["reading", "read", "pending"]

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
}

export function ReadlabPage() {
  const {
    texts: allTexts,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    isLoading,
    addText,
    updateText,
    deleteText,
    addFolder,
    deleteFolder,
    renameFolder,
  } = useReadlabDB()

  const { model } = useGptModel()
  const { setIsInsideFolder, setGoBack } = useFolder()

  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addMode, setAddMode] = useState<"paste" | "image">("paste")
  const [pasteTitle, setPasteTitle] = useState("")
  const [pasteContent, setPasteContent] = useState("")
  const [pastedImage, setPastedImage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTag, setSelectedTag] = useState<ReadLabTag | "all">("all")
  const [managedTextId, setManagedTextId] = useState<string | null>(null)
  const [managedTextTitle, setManagedTextTitle] = useState("")
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [isRenamingFolder, setIsRenamingFolder] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTargetFolderId, setDeleteTargetFolderId] = useState<string | null>(null)
  const [generalFolderName, setGeneralFolderName] = useState("General")
  const [generalFolderDeleted, setGeneralFolderDeleted] = useState(false)
  const [folderColors, setFolderColors] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("readlab_folder_colors")
      return saved ? JSON.parse(saved) : {}
    }
    return {}
  })

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addDialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const savedName = localStorage.getItem("readlab_general_folder_name")
    if (savedName) setGeneralFolderName(savedName)
    setGeneralFolderDeleted(localStorage.getItem("readlab_general_folder_deleted") === "true")
  }, [])

  const updateFolderColor = (folderId: string, color: string) => {
    const newColors = { ...folderColors, [folderId]: color }
    setFolderColors(newColors)
    localStorage.setItem("readlab_folder_colors", JSON.stringify(newColors))
  }

  const getFolderGradient = (folderId: string, index: number): "default" | "violet" | "emerald" | "amber" | "rose" => {
    const color = folderColors[folderId]
    if (color) return color as "default" | "violet" | "emerald" | "amber" | "rose"
    const defaults: Array<"default" | "violet" | "emerald" | "amber"> = ["default", "violet", "emerald", "amber"]
    return defaults[index % defaults.length]
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setIsCreatingFolder(true)
    await addFolder(newFolderName)
    setNewFolderName("")
    setShowNewFolderDialog(false)
    setIsCreatingFolder(false)
  }

  const handleRenameFolder = async () => {
    if (!editingFolderName.trim()) return
    setIsRenamingFolder(true)

    if (editingFolderId === null) {
      const newName = editingFolderName.trim()
      localStorage.setItem("readlab_general_folder_name", newName)
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

  const handleDeleteFolderWithMigration = async (folderId: string | null, targetFolderId: string | null) => {
    if (folderId === null) {
      const textsToDelete = allTexts.filter((t) => !t.folderId)
      for (const text of textsToDelete) {
        await deleteText(text.id)
      }
      localStorage.setItem("readlab_general_folder_deleted", "true")
      setGeneralFolderDeleted(true)
      setSelectedFolderId(null)
      setIsRenameDialogOpen(false)
      setShowDeleteConfirm(false)
      setDeleteTargetFolderId(null)
      toast({
        title: "Folder deleted",
        description: `"${generalFolderName}" and ${textsToDelete.length} ${textsToDelete.length === 1 ? "text" : "texts"} deleted.`,
      })
      return
    }

    const textsToMove = allTexts.filter((t) => t.folderId === folderId)
    let textsHandled = true
    if (targetFolderId && targetFolderId !== "__delete__") {
      for (const text of textsToMove) {
        if (!await updateText({ ...text, folderId: targetFolderId === "__general__" ? null : targetFolderId })) textsHandled = false
      }
    } else {
      for (const text of textsToMove) {
        if (!await deleteText(text.id)) textsHandled = false
      }
    }

    if (!textsHandled) {
      toast({ title: "Folder preserved", description: "Some texts could not be processed. Try again.", variant: "destructive" })
      return
    }
    if (!await deleteFolder(folderId)) {
      toast({ title: "Could not delete folder", description: "The texts were processed, but the folder remains.", variant: "destructive" })
      return
    }

    const folderName = folders.find((f) => f.id === folderId)?.name || "Unknown"
    const targetName = targetFolderId && targetFolderId !== "__delete__"
      ? targetFolderId === "__general__" ? generalFolderName : folders.find((f) => f.id === targetFolderId)?.name || "Unknown"
      : null

    setIsRenameDialogOpen(false)
    setShowDeleteConfirm(false)
    setDeleteTargetFolderId(null)

    toast({
      title: "Folder deleted",
      description: targetName
        ? `"${folderName}" deleted. ${textsToMove.length} texts moved to "${targetName}".`
        : `"${folderName}" and ${textsToMove.length} texts deleted.`,
    })
  }

  const handlePasteImage = useCallback(async (imageDataUrl: string) => {
    setIsProcessing(true)
    setAddMode("image")
    setPastedImage(imageDataUrl)

    try {
      const res = await fetch("/api/readlab/process-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: imageDataUrl }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "Failed to extract text from image")
      }

      const data = await res.json()
      if (data.extractedText) {
        setPasteContent(data.extractedText)
        setPasteTitle(data.extractedText.slice(0, 50).replace(/\n/g, " ") + "...")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast({
        title: "OCR failed",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }, [])

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!showAddDialog) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue

          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            handlePasteImage(dataUrl)
          }
          reader.readAsDataURL(blob)
          return
        }
      }
    }

    document.addEventListener("paste", handlePaste)
    return () => document.removeEventListener("paste", handlePaste)
  }, [showAddDialog, handlePasteImage])

  const handleSaveText = async () => {
    if (!pasteContent.trim()) return

    setIsProcessing(true)
    try {
      let translationMap: Record<string, string> = {}

      const res = await fetch("/api/readlab/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ReadLab bulk processing uses READLAB_AI_MODEL from .env.local — do
        // NOT forward the user's header model picker (that's for VocabLab
        // cards) so .env stays the single source of truth for ReadLab.
        body: JSON.stringify({ content: pasteContent }),
      })

      if (res.ok) {
        const data = await res.json()
        translationMap = data.translationMap || {}
      }

      const newText: ReadLabText = {
        id: crypto.randomUUID(),
        title: pasteTitle.trim() || pasteContent.slice(0, 50).replace(/\n/g, " ") + "...",
        content: pasteContent,
        sourceType: addMode,
        folderId: selectedFolderId,
        tags: [],
        highlights: [],
        translationMap,
        createdAt: Date.now(),
      }

      const success = await addText(newText)
      if (success) {
        toast({
          title: "Text saved!",
          description: `"${newText.title}" processed with ${Object.keys(translationMap).length} translated terms.`,
        })
        setShowAddDialog(false)
        setPasteTitle("")
        setPasteContent("")
        setPastedImage(null)
        setAddMode("paste")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast({
        title: "Failed to process text",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleToggleTag = async (textId: string, tag: ReadLabTag) => {
    const text = allTexts.find((t) => t.id === textId)
    if (!text) return

    const currentTags = text.tags || []
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag]

    await updateText({ ...text, tags: newTags })
  }

  const handleDeleteText = async (textId: string) => {
    const success = await deleteText(textId)
    if (success) {
      toast({
        title: "Text deleted",
        description: "The text has been permanently removed.",
      })
    }
  }

  const openTextManager = (text: ReadLabText) => {
    setManagedTextId(text.id)
    setManagedTextTitle(text.title)
  }

  const saveManagedTextTitle = async () => {
    const text = allTexts.find((item) => item.id === managedTextId)
    const title = managedTextTitle.trim()
    if (!text || !title) return
    const success = await updateText({ ...text, title })
    if (success) {
      setManagedTextId(null)
      toast({ title: "Text renamed", description: `The text is now called "${title}".` })
    }
  }

  const selectedFolder = folders.find((f) => f.id === selectedFolderId)
  const isViewingFolder = selectedFolderId !== null
  const isGeneralFolder = selectedFolderId === "__general__"

  const displayedTexts = isGeneralFolder
    ? allTexts.filter((t) => !t.folderId)
    : selectedFolderId
    ? allTexts.filter((t) => t.folderId === selectedFolderId)
    : allTexts

  const normalizedSearch = normalizeForSearch(searchQuery.trim())
  const filteredTexts = displayedTexts.filter((t) => {
    const matchesTag = selectedTag === "all" || (t.tags || []).includes(selectedTag)
    if (!matchesTag) return false
    if (!normalizedSearch) return true
    const haystack = [t.title, t.content].join(" ")
    return normalizeForSearch(haystack).includes(normalizedSearch)
  })

  const viewingText = allTexts.find((t) => t.id === selectedTextId)
  const managedText = allTexts.find((t) => t.id === managedTextId)

  useEffect(() => {
    setIsInsideFolder(isViewingFolder || !!selectedTextId)
  }, [isViewingFolder, selectedTextId, setIsInsideFolder])

  useEffect(() => {
    setGoBack(() => {
      if (selectedTextId) {
        setSelectedTextId(null)
      } else {
        setSelectedFolderId(null)
        setSearchQuery("")
        setSelectedTag("all")
      }
    })
  }, [setGoBack, selectedTextId, setSelectedFolderId])

  if (viewingText) {
    return (
      <ReadTextView
        text={viewingText}
        onUpdateText={updateText}
      />
    )
  }

  return (
    <div className="w-full">
      {/* ═══ HOME VIEW - Folders ═══ */}
      {!isViewingFolder && !selectedTextId && (
        <>
          {/* Hero Section */}
          <div className="mb-20 flex flex-col items-center gap-6 pt-4 sm:mb-16 sm:pt-6">
            <h1 className="lab-title select-none font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">
              ReadLab
            </h1>
          </div>

          {/* Folders Grid */}
          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {/* General folder */}
              {!generalFolderDeleted && <FolderCard
                name={generalFolderName}
                wordCount={allTexts.filter((t) => !t.folderId).length}
                gradient={getFolderGradient("__general__", 0)}
                isSelected={selectedFolderId === "__general__"}
                onClick={() => {
                  setSelectedFolderId("__general__")
                }}
                onSettings={(e) => {
                  e.stopPropagation()
                  setEditingFolderId(null)
                  setEditingFolderName(generalFolderName)
                  setIsRenameDialogOpen(true)
                }}
              />}

              {/* User folders */}
              {folders.map((folder, idx) => {
                const folderTexts = allTexts.filter((t) => t.folderId === folder.id)
                return (
                  <FolderCard
                    key={folder.id}
                    name={folder.name}
                    wordCount={folderTexts.length}
                    gradient={getFolderGradient(folder.id, idx)}
                    isSelected={selectedFolderId === folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    onSettings={(e) => {
                      e.stopPropagation()
                      setEditingFolderId(folder.id)
                      setEditingFolderName(folder.name)
                      setIsRenameDialogOpen(true)
                    }}
                  />
                )
              })}

              {/* New folder button */}
              <NewFolderCard onClick={() => { setNewFolderName(""); setShowNewFolderDialog(true) }} />
            </div>
          </div>
        </>
      )}

      {/* ═══ FOLDER VIEW - Inside a folder ═══ */}
      {isViewingFolder && !selectedTextId && (
        <>
          {/* Hero Section */}
          <div className="mb-8 flex flex-col items-center gap-6 pt-4 sm:mb-10 sm:pt-6">
            <h1 className="lab-title select-none font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">
              ReadLab
            </h1>
          </div>

          {/* Control Bar + Search + Tag Filter */}
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Search bar */}
              <div className={cn(
                "flex min-w-0 items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-2 shadow-sm",
                "w-full sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]"
              )}>
                <Search className="size-4 shrink-0 text-muted-foreground/60" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title"
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
                      title={selectedTag === "all" ? "Filter by tag" : `Filtering: ${READLAB_TAG_LABELS[selectedTag]}`}
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
                    {ALL_TAGS.map((tag) => (
                      <DropdownMenuItem
                        key={tag}
                        onClick={() => setSelectedTag(tag)}
                        className={cn(selectedTag === tag && "text-primary")}
                      >
                        {READLAB_TAG_LABELS[tag]}
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
            </div>
          </div>

          {/* Texts Grid */}
          <div className="mt-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {/* New text card */}
                <button
                  type="button"
                  onClick={() => {
                    setPasteTitle("")
                    setPasteContent("")
                    setPastedImage(null)
                    setAddMode("paste")
                    setShowAddDialog(true)
                  }}
                  className={cn(
                    "group order-last flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/50 bg-transparent p-8",
                    "transition-all duration-300",
                    "hover:border-primary/30 hover:bg-primary/5"
                  )}
                >
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/60 transition-all group-hover:bg-primary/10 group-hover:text-primary/70">
                    <span className="text-2xl font-light">+</span>
                  </div>
                  <span className="text-[13px] font-medium text-muted-foreground/70 group-hover:text-muted-foreground">
                    New text
                  </span>
                </button>

                {/* Text cards */}
                {filteredTexts.map((text) => (
                  <div key={text.id} className="relative group" onContextMenu={(event) => { event.preventDefault(); openTextManager(text) }}>
                    <TextCard
                      text={text}
                      onClick={() => setSelectedTextId(text.id)}
                      onDelete={handleDeleteText}
                    />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && filteredTexts.length === 0 && searchQuery && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Search className="size-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg text-foreground mb-1">
                  No texts found
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Try adjusting your search or filters.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ NEW FOLDER DIALOG ═══ */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Organize your texts into folders by topic.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Input
              placeholder="Folder name"
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

      <Dialog open={Boolean(managedText)} onOpenChange={(open) => !open && setManagedTextId(null)}>
        <DialogContent className="max-w-[92vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Text</DialogTitle>
            <DialogDescription>Rename the text, change its tags, or remove it.</DialogDescription>
          </DialogHeader>
          {managedText && (
            <div className="space-y-5 pt-2">
              <div className="space-y-2">
                <label className="text-[12px] font-medium text-muted-foreground">Text title</label>
                <div className="flex gap-2">
                  <Input value={managedTextTitle} onChange={(event) => setManagedTextTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveManagedTextTitle()} />
                  <Button variant="outline" disabled={!managedTextTitle.trim()} onClick={() => void saveManagedTextTitle()}>Rename</Button>
                </div>
              </div>
              <div className="space-y-2 border-t border-border/30 pt-4">
                <label className="text-[12px] font-medium text-muted-foreground">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_TAGS.map((tag) => {
                    const active = (managedText.tags || []).includes(tag)
                    return (
                      <button key={tag} type="button" onClick={() => void handleToggleTag(managedText.id, tag)} className={cn("rounded-full border px-3 py-1.5 text-[12px] transition-colors", active ? cn(READLAB_TAG_COLORS[tag], "border-primary/25") : "border-border/40 text-muted-foreground hover:border-border/70 hover:text-foreground")}>
                        {READLAB_TAG_LABELS[tag]}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="border-t border-border/30 pt-4">
                <Button variant="outline" className="w-full border-destructive/20 text-destructive hover:bg-destructive/10" onClick={async () => { await handleDeleteText(managedText.id); setManagedTextId(null) }}>
                  <Trash2 className="mr-2 size-4 text-muted-foreground" />
                  Delete text
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ ADD TEXT DIALOG ═══ */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-h-[90vh] max-w-[92vw] overflow-hidden sm:max-w-lg flex flex-col" ref={addDialogRef}>
          <DialogHeader>
            <DialogTitle>Add Text</DialogTitle>
            <DialogDescription>
              Paste English text or paste an image from clipboard (Ctrl+V) for OCR processing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1">

          {/* Mode tabs */}
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setAddMode("paste")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                addMode === "paste"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <FileText className="size-3.5" />
              Paste Text
            </button>
            <button
              type="button"
              onClick={() => setAddMode("image")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                addMode === "image"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Image className="size-3.5" />
              Paste Image
            </button>
          </div>

          <div className="space-y-4 mt-2">
            {/* Title */}
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Title (optional)</label>
              <Input
                placeholder="e.g. Technology article"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
            </div>

            {/* Content area */}
            {addMode === "paste" ? (
              <div className="space-y-2">
                <label className="text-[12px] font-medium text-muted-foreground">English text</label>
                <textarea
                  ref={textareaRef}
                  placeholder="Paste your English text here..."
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  className="w-full min-h-[200px] rounded-xl border border-border/50 bg-background/80 px-4 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[12px] font-medium text-muted-foreground">
                  Image (paste from clipboard with Ctrl+V)
                </label>
                {pastedImage ? (
                  <div className="relative">
                    <img
                      src={pastedImage}
                      alt="Pasted image"
                      className="w-full max-h-[300px] rounded-xl border border-border/50 object-contain"
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/80">
                        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          Extracting text...
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPastedImage(null)
                        setPasteContent("")
                      }}
                      className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/50 py-12 text-center">
                    <Image className="mb-2 size-8 text-muted-foreground/40" />
                    <p className="text-[13px] text-muted-foreground/60">
                      Press Ctrl+V to paste an image
                    </p>
                    <p className="text-[11px] text-muted-foreground/40 mt-1">
                      Supports screenshots, photos, and scanned documents
                    </p>
                  </div>
                )}
                {pasteContent && (
                  <div className="space-y-2">
                    <label className="text-[12px] font-medium text-muted-foreground">Extracted text</label>
                    <textarea
                      placeholder="Extracted text will appear here..."
                      value={pasteContent}
                      onChange={(e) => setPasteContent(e.target.value)}
                      className="w-full min-h-[120px] rounded-xl border border-border/50 bg-background/80 px-4 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="-mx-1 flex justify-end gap-2 border-t border-border/30 px-1 pb-1 pt-3">
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveText}
                disabled={isProcessing || !pasteContent.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  "Save and Process"
                )}
              </Button>
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ RENAME/MANAGE FOLDER DIALOG ═══ */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="min-h-[360px] max-w-[92vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Folder</DialogTitle>
            <DialogDescription>
              {editingFolderId === null
                ? `Manage the "${generalFolderName}" folder.`
                : `Manage folder "${editingFolderName}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Folder name */}
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Folder name</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Folder name"
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder() }}
                />
                <Button
                  onClick={handleRenameFolder}
                  disabled={isRenamingFolder || !editingFolderName.trim()}
                  variant="outline"
                >
                  {isRenamingFolder ? <Loader2 className="size-4 animate-spin" /> : "Rename"}
                </Button>
              </div>
            </div>

            {/* Color options */}
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">Folder color</label>
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
                        const newColors = { ...folderColors, ["__general__"]: colorOption.id }
                        setFolderColors(newColors)
                        localStorage.setItem("readlab_folder_colors", JSON.stringify(newColors))
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

            {/* Delete folder */}
            <div className="space-y-3 pt-2 border-t border-border/30">
              <LongPressButton
                onLongPress={() => setShowDeleteConfirm(true)}
                className="w-full h-10 rounded-md border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="size-4 text-muted-foreground" />
                <span>Hold to delete</span>
              </LongPressButton>
            </div>

            {/* Transfer texts */}
            {editingFolderId !== null && (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <label className="text-[12px] font-medium text-muted-foreground">Move all texts to</label>
                <div className="flex flex-wrap gap-2">
                  {!generalFolderDeleted && <button
                    type="button"
                    onClick={async () => {
                      const textsToMove = allTexts.filter((t) => t.folderId === editingFolderId)
                      await Promise.all(textsToMove.map((t) => updateText({ ...t, folderId: null })))
                      toast({
                        title: "Texts moved",
                        description: `${textsToMove.length} texts moved to "${generalFolderName}".`,
                      })
                      setIsRenameDialogOpen(false)
                    }}
                    className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground hover:border-border/60 hover:text-foreground transition-colors"
                  >
                    {generalFolderName}
                  </button>}
                  {folders.filter((f) => f.id !== editingFolderId).map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={async () => {
                      const textsToMove = allTexts.filter((t) => t.folderId === editingFolderId)
                        await Promise.all(textsToMove.map((t) => updateText({ ...t, folderId: folder.id })))
                        toast({
                          title: "Texts moved",
                          description: `${textsToMove.length} texts moved to "${folder.name}".`,
                        })
                        setIsRenameDialogOpen(false)
                      }}
                      className="rounded-full border border-border/30 px-3 py-1 text-[12px] text-muted-foreground hover:border-border/60 hover:text-foreground transition-colors"
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ DELETE FOLDER CONFIRMATION ═══ */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-sm">
          <AlertDialogHeader className="pr-8">
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              {editingFolderId === null
                ? `Delete "${generalFolderName}" folder and all its texts?`
                : `Delete "${editingFolderName}"? Choose whether to transfer or permanently delete its texts.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {editingFolderId !== null && (
            <FolderDeleteOptions label="What should happen to its texts?">
                {!generalFolderDeleted && <FolderDeleteChoice
                  onClick={() => setDeleteTargetFolderId("__general__")}
                  selected={deleteTargetFolderId === "__general__"}
                >
                  {generalFolderName}
                </FolderDeleteChoice>}
                {folders.filter((f) => f.id !== editingFolderId).map((folder) => (
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
                  Delete texts
                </FolderDeleteChoice>
            </FolderDeleteOptions>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteConfirm(false); setDeleteTargetFolderId(null) }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={editingFolderId !== null && !deleteTargetFolderId}
              onClick={() => handleDeleteFolderWithMigration(editingFolderId, deleteTargetFolderId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
