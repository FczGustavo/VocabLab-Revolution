"use client"

import { useMemo, useState } from "react"
import { ArrowRightLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface TransferItem {
  id: string
  label: string
  detail?: string
  tag?: string
  tagLabel?: string
  streak?: number
}

interface FolderTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceName: string
  items: TransferItem[]
  folders: Array<{ id: string; name: string; count: number }>
  tagOptions?: Array<{ value: string; label: string }>
  onCreateFolder: (name: string) => Promise<{ id: string; name: string } | null>
  onTransfer: (ids: string[], destinationId: string) => Promise<boolean>
}

export function FolderTransferDialog({ open, onOpenChange, sourceName, items, folders, tagOptions = [], onCreateFolder, onTransfer }: FolderTransferDialogProps) {
  const [mode, setMode] = useState<"filters" | "manual">("filters")
  const [tag, setTag] = useState("all")
  const [streak, setStreak] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [destination, setDestination] = useState("")
  const [newFolderName, setNewFolderName] = useState("")
  const [busy, setBusy] = useState(false)
  const matching = useMemo(() => mode === "manual"
    ? items.filter((item) => selectedIds.has(item.id))
    : items.filter((item) => (tag === "all" || item.tag === tag) && (streak === 0 || (item.streak ?? 0) >= streak)),
  [items, mode, selectedIds, streak, tag])

  const transfer = async () => {
    if (!matching.length || !destination || busy) return
    setBusy(true)
    try {
      let target = destination
      if (target === "__new__") {
        const folder = await onCreateFolder(newFolderName.trim())
        if (!folder) return
        target = folder.id
      }
      if (await onTransfer(matching.map((item) => item.id), target)) {
        onOpenChange(false)
        setDestination("")
        setNewFolderName("")
        setSelectedIds(new Set())
      }
    } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[96vw] flex-col overflow-hidden sm:max-w-2xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><ArrowRightLeft className="size-4" /></span>Sistema de transferência</DialogTitle><DialogDescription>Organize os cards de “{sourceName}” sem apagar a pasta de origem.</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 scrollbar-hide">
        <section className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">1. Selecione os cards</h3><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{matching.length} cards</span></div>
          <div className="grid grid-cols-2 gap-2"><Button variant={mode === "filters" ? "default" : "outline"} onClick={() => setMode("filters")}>Usar regras</Button><Button variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}>Escolher cards</Button></div>
          {mode === "filters" ? <div className="grid gap-3 sm:grid-cols-2">{tagOptions.length > 0 && <label className="space-y-1.5 text-xs font-medium text-muted-foreground">Categoria<select value={tag} onChange={(event) => setTag(event.target.value)} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground"><option value="all">Todas</option>{tagOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}<label className="space-y-1.5 text-xs font-medium text-muted-foreground">Mínimo de acertos consecutivos<Input type="number" min={0} max={99} value={streak} onChange={(event) => setStreak(Math.max(0, Number(event.target.value) || 0))} /></label></div> : <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-background p-2 scrollbar-hide">{items.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50"><input type="checkbox" className="size-4 accent-primary" checked={selectedIds.has(item.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{item.label}</span>{item.detail && <span className="block truncate text-[10px] text-muted-foreground">{item.detail}</span>}</span>{item.tagLabel && <span className="text-[10px] text-muted-foreground">{item.tagLabel}</span>}<span className="text-[10px] text-muted-foreground">{item.streak ?? 0}×</span></label>)}</div>}
        </section>
        <section className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4"><h3 className="text-sm font-semibold">2. Escolha o destino</h3><div className="grid gap-2 sm:grid-cols-2">{folders.map((folder) => <button key={folder.id} type="button" onClick={() => setDestination(folder.id)} className={cn("rounded-xl border p-3 text-left", destination === folder.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/50 hover:bg-muted/40")}><span className="block truncate text-sm font-medium">{folder.name}</span><span className="text-[11px] text-muted-foreground">{folder.count} cards</span></button>)}<button type="button" onClick={() => setDestination("__new__")} className={cn("rounded-xl border border-dashed p-3 text-left", destination === "__new__" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/50 hover:bg-muted/40")}><span className="text-sm font-medium text-primary">+ Nova pasta</span></button></div>{destination === "__new__" && <Input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Nome da nova pasta" />}</section>
      </div>
      <div className="border-t border-border/50 pt-4"><Button className="w-full" disabled={busy || !matching.length || !destination || (destination === "__new__" && !newFolderName.trim())} onClick={() => void transfer()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRightLeft className="mr-2 size-4" />}Transferir {matching.length} cards</Button></div>
    </DialogContent>
  </Dialog>
}
