"use client"

import { ArrowRightLeft, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LongPressButton } from "@/components/long-press-button"
import { cn } from "@/lib/utils"

interface FolderManagerPanelProps {
  name: string
  onNameChange: (value: string) => void
  onRename: () => void
  renaming?: boolean
  colors: Array<{ id: string; className: string; label: string }>
  activeColor: string
  onColorChange: (id: string) => void
  cardCount: number
  groupCount?: number
  groupLabel?: string
  onTransfer: () => void
  onDelete: () => void
  itemLabel?: string
  transferHint?: string
  kind?: "cards" | "theory"
  onKindChange?: (kind: "cards" | "theory") => void
  showGroup?: boolean
}

export function FolderManagerPanel({ name, onNameChange, onRename, renaming = false, colors, activeColor, onColorChange, cardCount, groupCount, groupLabel = "categorias", onTransfer, onDelete, itemLabel = "cards", transferHint = "Filtrar e mover", kind = "cards", onKindChange, showGroup = true }: FolderManagerPanelProps) {
  return <div className="mt-2 space-y-5">
    <div className={cn("grid gap-2 rounded-xl border border-border/40 bg-muted/20 p-3", showGroup ? "grid-cols-2" : "grid-cols-1")}>
      <div><p className="text-xl font-semibold tabular-nums">{cardCount}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{itemLabel}</p></div>
      {showGroup && <div><p className="text-xl font-semibold tabular-nums">{groupCount ?? 0}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{groupLabel}</p></div>}
    </div>
    <div className="space-y-2"><label className="text-[12px] font-medium text-muted-foreground">Nome da pasta</label><div className="flex flex-col gap-2 sm:flex-row"><Input className="min-w-0 flex-1" value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onRename()} /><Button className="w-full shrink-0 sm:w-auto" variant="outline" disabled={!name.trim() || renaming} onClick={onRename}>{renaming ? <Loader2 className="size-4 animate-spin" /> : "Renomear"}</Button></div></div>
    {onKindChange && <div className="space-y-2"><label className="text-[12px] font-medium text-muted-foreground">Folder type</label><select value={kind} onChange={(event) => onKindChange(event.target.value as "cards" | "theory")} className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm"><option value="cards">Cards</option><option value="theory">Theory</option></select><p className="text-[11px] text-muted-foreground">The type can change only while the folder is empty.</p></div>}
    <div className="space-y-2"><label className="text-[12px] font-medium text-muted-foreground">Cor da pasta</label><div className="flex gap-2">{colors.map((color) => <button key={color.id} type="button" title={color.label} aria-label={color.label} onClick={() => onColorChange(color.id)} className={cn("size-8 rounded-full transition-all", color.className, activeColor === color.id ? "ring-2 ring-foreground/30 ring-offset-2" : "hover:scale-110")} />)}</div></div>
    <div className="border-t border-border/30 pt-4"><Button variant="outline" className="h-auto min-h-12 w-full flex-col items-stretch gap-2 rounded-xl bg-muted/20 px-3 py-2.5 hover:bg-muted/45 sm:flex-row sm:items-center sm:justify-between" onClick={onTransfer}><span className="flex min-w-0 items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ArrowRightLeft className="size-3.5" /></span><span className="break-words text-left leading-snug [overflow-wrap:anywhere]">Sistema de transferência</span></span><span className="break-words text-left text-[11px] leading-snug text-muted-foreground sm:text-right">{transferHint}</span></Button></div>
    <div className="border-t border-border/30 pt-4"><LongPressButton onLongPress={onDelete} className="h-11 w-full rounded-xl border border-destructive/20 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="size-4 text-muted-foreground" /><span>Segure para excluir</span></LongPressButton></div>
  </div>
}
