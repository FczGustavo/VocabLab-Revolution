"use client"

import { useState } from "react"
import { Settings, Folder, FolderPlus, FileUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface FolderCardProps {
  name: string
  wordCount: number
  isSelected?: boolean
  isAddDestination?: boolean
  onClick?: () => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onSettings?: (e: React.MouseEvent) => void
  gradient?: "default" | "blue" | "violet" | "emerald" | "amber" | "rose"
  isReview?: boolean
  subtitle?: string
}

const gradients = {
  default: "from-blue-400/25 via-blue-300/12 to-blue-200/5",
  blue: "from-blue-400/25 via-blue-300/12 to-blue-200/5",
  violet: "from-violet-400/20 via-violet-300/10 to-violet-200/5",
  emerald: "from-emerald-400/20 via-emerald-300/10 to-emerald-200/5",
  amber: "from-amber-400/20 via-amber-300/10 to-amber-200/5",
  rose: "from-rose-400/20 via-rose-300/10 to-rose-200/5",
}

const iconColors = {
  default: "text-blue-500/70",
  blue: "text-blue-500/70",
  violet: "text-violet-500/60",
  emerald: "text-emerald-500/60",
  amber: "text-amber-500/60",
  rose: "text-rose-500/60",
}

export function FolderCard({
  name,
  wordCount,
  isSelected = false,
  isAddDestination = false,
  onClick,
  onContextMenu,
  onSettings,
  gradient = "default",
  isReview = false,
  subtitle,
}: FolderCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "dark-folder-card group relative flex min-h-32 w-full flex-col overflow-hidden rounded-2xl border transition-all duration-300 sm:min-h-40",
        "bg-gradient-to-br",
        gradients[gradient],
        isSelected
          ? "border-primary/30 shadow-lg shadow-primary/10 ring-2 ring-primary/20"
          : isAddDestination
          ? "border-primary/50 shadow-lg shadow-primary/10 ring-2 ring-primary/30"
          : "border-border/40 hover:border-primary/20 hover:shadow-md"
      )}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden dark:hidden">
        <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/30 blur-2xl" />
        <div className="absolute -bottom-12 -left-12 size-40 rounded-full bg-white/20 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative flex flex-1 flex-col justify-between p-4 sm:p-5">
        {isAddDestination && (
          <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Adding here
          </span>
        )}
        {/* Top section with decorative lines */}
        <div className="mb-5 space-y-1.5 opacity-40 sm:mb-8">
          <div className="h-1 w-16 rounded-full bg-foreground/20" />
          <div className="h-1 w-12 rounded-full bg-foreground/15" />
          <div className="h-1 w-20 rounded-full bg-foreground/10" />
        </div>

        {/* Bottom section */}
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2 text-left">
            <Folder className={cn("mt-0.5 size-4 shrink-0", iconColors[gradient])} />
            <div className="min-w-0 space-y-1">
              <h3 className="max-w-full break-words text-[14px] font-semibold leading-snug text-foreground/80 [overflow-wrap:anywhere] sm:text-[15px]">
                {name}
              </h3>
              <p className="text-[12px] leading-snug text-muted-foreground/70">
              {subtitle ?? (isReview ? `${wordCount} words to review` : `Notes & Journaling · ${wordCount}`)}
              </p>
            </div>
          </div>

          {onSettings && (
            <div
              role="button"
              tabIndex={0}
              data-settings-button="true"
              onClick={(e) => { e.stopPropagation(); onSettings(e) }}
              onContextMenu={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSettings(e as any) }}
              className="absolute bottom-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/50 text-muted-foreground/60 opacity-0 backdrop-blur-sm transition-all hover:bg-white/80 hover:text-foreground group-hover:opacity-100 sm:bottom-4 sm:right-4 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              title="Folder settings"
            >
              <Settings className="size-4" />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

interface NewFolderCardProps {
  onClick?: () => void
  /** VocabLab opts into the import tray; other labs retain the simple new-folder card. */
  onImport?: () => void
}

export function NewFolderCard({ onClick, onImport }: NewFolderCardProps) {
  const [showActions, setShowActions] = useState(false)

  if (onImport) {
    return (
      <div
        className="group relative min-h-32 w-full sm:min-h-40"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex h-full min-h-32 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/50 bg-transparent p-5 sm:min-h-40 sm:p-8",
            "transition-all duration-300 hover:border-primary/30 hover:bg-primary/5"
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/60 transition-all group-hover:bg-primary/10 group-hover:text-primary/70">
            <span className="-translate-y-px text-2xl font-light leading-none">+</span>
          </div>
          <span className="text-[13px] font-medium text-muted-foreground/70 group-hover:text-muted-foreground">
            New folder
          </span>
        </button>

        {showActions && (
          <div className="absolute inset-2 z-10 flex flex-col justify-center gap-1.5 rounded-xl border border-border/60 bg-background/95 p-3 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              onClick={onClick}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground/75 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <FolderPlus className="size-3.5" />
              Add folder
            </button>
            <button
              type="button"
              onClick={onImport}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground/75 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <FileUp className="size-3.5" />
              Import PDF
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/50 bg-transparent p-5 sm:min-h-40 sm:p-8",
        "transition-all duration-300",
        "hover:border-primary/30 hover:bg-primary/5"
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/60 transition-all group-hover:bg-primary/10 group-hover:text-primary/70">
        <span className="-translate-y-px text-2xl font-light leading-none">+</span>
      </div>
      <span className="text-[13px] font-medium text-muted-foreground/70 group-hover:text-muted-foreground">
        New folder
      </span>
    </button>
  )
}
