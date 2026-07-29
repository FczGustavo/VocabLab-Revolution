"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudyShortcutCoach } from "@/hooks/use-study-shortcut-coach"

export function StudyHeader({ folderName, subtitle, progress, current, total, rating, collapsed, onCollapsedChange, onExit, trailing }: { folderName: string; subtitle: string; progress: number; current: number; total: number; rating?: "known" | "again" | null; collapsed: boolean; onCollapsedChange: (value: boolean) => void; onExit: () => void; trailing?: ReactNode }) {
  return (
    <div className={cn("relative z-50 shrink-0 transition-[height] duration-300 ease-in-out", collapsed ? "h-0" : "h-[65px]")}>
      <header className={cn("absolute inset-x-0 top-0 flex h-[65px] items-center gap-3 border-b border-border/40 bg-background px-4 py-3 transition-transform duration-300 ease-in-out sm:px-6", collapsed && "-translate-y-full")}>
        <Button variant="ghost" size="icon" onClick={onExit} className="text-muted-foreground" aria-label="Exit study"><X className="size-5" /></Button>
        <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground/85">{folderName}</p><p className="truncate text-xs text-muted-foreground">{subtitle}</p></div>
        <div className="mx-3 h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all duration-300", rating === "known" ? "bg-success" : rating === "again" ? "bg-destructive/40" : "bg-primary")} style={{ width: `${progress}%` }} /></div>
        <span className="text-xs font-medium text-muted-foreground">{current}/{total}</span>
        {trailing}
      </header>
      <button type="button" onClick={() => onCollapsedChange(!collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? "Show study progress" : "Hide study progress"} title={collapsed ? "Show progress" : "Hide progress"} className={cn("fixed left-1/2 z-[60] flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-border/50 bg-background/95 text-muted-foreground shadow-sm backdrop-blur transition-[top,background-color,color] duration-300 hover:bg-muted hover:text-foreground", collapsed ? "top-2" : "top-[51px]")}>
        {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>
    </div>
  )
}

export function useStudyKeyboardShortcuts({ enabled = true, onKnown, onAgain, onReveal, onHide }: { enabled?: boolean; onKnown?: () => void; onAgain?: () => void; onReveal?: () => void; onHide?: () => void }) {
  const handlers = useRef({ onKnown, onAgain, onReveal, onHide })
  handlers.current = { onKnown, onAgain, onReveal, onHide }

  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("[role='dialog'], [data-study-shortcuts-ignore]") || target?.isContentEditable || target?.closest("textarea, select")) return
      const focusedInput = target?.closest("input") as HTMLInputElement | null
      if (focusedInput) {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
        focusedInput.blur()
      }
      const action = event.key === "ArrowRight" ? handlers.current.onKnown : event.key === "ArrowLeft" ? handlers.current.onAgain : event.key === "ArrowUp" ? handlers.current.onReveal : event.key === "ArrowDown" ? handlers.current.onHide : undefined
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [enabled])
}

export function StudyShortcutCoach({ visible, showReveal = true, animated = true }: { visible: boolean; showReveal?: boolean; animated?: boolean }) {
  const { enabled } = useStudyShortcutCoach()
  if (!visible || !enabled) return null
  return <div aria-hidden="true" className="pointer-events-none fixed bottom-2 left-1/2 z-[60] -translate-x-1/2 sm:bottom-4 lg:bottom-auto lg:left-[calc(50%+19rem)] lg:top-1/2 lg:translate-x-0 lg:-translate-y-1/2"><div className={cn("flex max-w-[94vw] items-center gap-2 rounded-full border border-border/50 bg-background/90 px-3 py-2 text-[10px] font-medium text-muted-foreground shadow-md backdrop-blur-md lg:w-36 lg:flex-col lg:items-stretch lg:gap-2.5 lg:rounded-2xl lg:p-3 lg:text-[11px]", animated && "animate-in fade-in slide-in-from-bottom-2 duration-500 lg:slide-in-from-left-2")}><span className="flex items-center gap-1.5 lg:justify-start"><kbd className={cn("flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/70 font-mono text-sm text-foreground", animated && "animate-pulse")}>←</kbd><span>Again</span></span>{showReveal && <span className="flex items-center gap-1.5 border-x border-border/50 px-2 lg:border-x-0 lg:border-y lg:px-0 lg:py-2.5"><ChevronsUpDown className={cn("size-4 shrink-0 text-primary/80", animated && "animate-bounce")} /><span className="hidden lg:inline">Reveal / front</span><span className="lg:hidden">Turn</span><span className="ml-auto flex gap-0.5"><kbd className="rounded border border-border/60 bg-muted/70 px-1 font-mono text-foreground">↑</kbd><kbd className="rounded border border-border/60 bg-muted/70 px-1 font-mono text-foreground">↓</kbd></span></span>}<span className="flex items-center gap-1.5 lg:justify-between"><span>I knew it</span><kbd className={cn("flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/70 font-mono text-sm text-foreground", animated && "animate-pulse")}>→</kbd></span></div></div>
}
