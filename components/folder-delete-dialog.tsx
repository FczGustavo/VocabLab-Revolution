"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Check, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function FolderDeleteOptions({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border/45 bg-muted/20 p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto scrollbar-hide">
        {children}
      </div>
    </div>
  )
}

export function FolderDeleteChoice({
  selected,
  danger = false,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-all",
        danger
          ? selected
            ? "border-destructive/45 bg-destructive/10 text-destructive shadow-sm"
            : "border-destructive/20 text-destructive/80 hover:border-destructive/35 hover:bg-destructive/5"
          : selected
            ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
            : "border-border/40 text-muted-foreground hover:border-border/70 hover:bg-background/70 hover:text-foreground",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected
            ? danger
              ? "border-destructive/50 bg-destructive text-destructive-foreground"
              : "border-primary/50 bg-primary text-primary-foreground"
            : "border-border/60",
        )}
      >
        {selected && (danger ? <Trash2 className="size-2.5" /> : <Check className="size-2.5" />)}
      </span>
      <span className="min-w-0 break-words whitespace-normal leading-snug [overflow-wrap:anywhere]">{children}</span>
    </button>
  )
}
