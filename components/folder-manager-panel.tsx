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
}

export function FolderManagerPanel({ name, onNameChange, onRename, renaming = false, colors, activeColor, onColorChange, cardCount, groupCount, groupLabel = "categorias", onTransfer, onDelete }: FolderManagerPanelProps) {
  return <div className="mt-2 space-y-5">
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/40 bg-muted/20 p-3">
      <div><p className="text-xl font-semibold tabular-nums">{cardCount}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">cards</p></div>
      <div><p className="text-xl font-semibold tabular-nums">{groupCount ?? 0}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{groupLabel}</p></div>
    </div>
    <div className="space-y-2"><label className="text-[12px] font-medium text-muted-foreground">Nome da pasta</label><div className="flex gap-2"><Input className="min-w-0 flex-1" value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onRename()} /><Button className="shrink-0" variant="outline" disabled={!name.trim() || renaming} onClick={onRename}>{renaming ? <Loader2 className="size-4 animate-spin" /> : "Renomear"}</Button></div></div>
    <div className="space-y-2"><label className="text-[12px] font-medium text-muted-foreground">Cor da pasta</label><div className="flex gap-2">{colors.map((color) => <button key={color.id} type="button" title={color.label} aria-label={color.label} onClick={() => onColorChange(color.id)} className={cn("size-8 rounded-full transition-all", color.className, activeColor === color.id ? "ring-2 ring-foreground/30 ring-offset-2" : "hover:scale-110")} />)}</div></div>
    <div className="border-t border-border/30 pt-4"><Button variant="outline" className="h-12 w-full justify-between rounded-xl bg-muted/20 px-3 hover:bg-muted/45" onClick={onTransfer}><span className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><ArrowRightLeft className="size-3.5" /></span>Sistema de transferência</span><span className="text-[11px] text-muted-foreground">Filtrar e mover</span></Button></div>
    <div className="border-t border-border/30 pt-4"><LongPressButton onLongPress={onDelete} className="h-11 w-full rounded-xl border border-destructive/20 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="size-4 text-muted-foreground" /><span>Segure para excluir</span></LongPressButton></div>
  </div>
}
