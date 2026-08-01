"use client"

import { FileText, Image, File, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReadLabText } from "@/lib/types"
import { READLAB_TAG_LABELS, READLAB_TAG_COLORS } from "@/lib/types"

interface TextCardProps {
  text: ReadLabText
  onClick?: () => void
  onDelete?: (id: string) => void
  layout?: "grid" | "list" | "compact"
}

const sourceIcons = {
  paste: FileText,
  image: Image,
  pdf: File,
}

const sourceLabels = {
  paste: "Pasted text",
  image: "Image (OCR)",
  pdf: "PDF document",
}

export function TextCard({ text, onClick, onDelete, layout = "grid" }: TextCardProps) {
  const Icon = sourceIcons[text.sourceType] || FileText
  const preview = text.content.replace(/\s+/g, " ").trim()
  const date = new Date(text.createdAt).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

  const wordCount = text.content.split(/\s+/).filter(Boolean).length
  const tags = text.tags || []

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all duration-300",
        "border-border/40 bg-card/75 shadow-sm hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-lg hover:shadow-primary/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        layout === "list" && "flex-row items-center gap-4 p-4",
        layout === "compact" && "p-3",
        layout === "grid" && "h-[224px] p-4"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className={cn(
        "min-h-0",
        layout === "list" ? "min-w-0 flex-1" : "flex flex-1 flex-col"
      )}>
        {/* Header: icon + title + source metadata */}
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 shadow-sm">
            <Icon className="size-4 text-primary/75" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={cn(
              "line-clamp-2 break-words font-semibold leading-snug tracking-[-0.01em] text-foreground/90",
              layout === "compact" ? "text-[12px]" : "text-[13px]"
            )}>
              {text.title}
            </h3>
            <p className="mt-1 text-[10px] leading-none text-muted-foreground/55">
              {sourceLabels[text.sourceType]} · {wordCount} words
            </p>
          </div>
        </div>

        {/* Preview */}
        {layout !== "compact" && (
          <p className={cn(
            "mt-3 min-h-0 flex-1 text-[12px] leading-5 text-muted-foreground/70 line-clamp-4",
            layout === "list" && "mt-0 flex-none"
          )}>
            {preview}
          </p>
        )}

      </div>

      {/* Footer: date + translated count + delete */}
      <div className={cn(
        "mt-3 flex min-w-0 items-center gap-2 border-t border-border/25 pt-2.5",
        layout === "list" && "mt-0 flex-col items-end gap-1 border-t-0 pt-0",
        layout === "compact" && "mt-2 pt-2"
      )}>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/40">
          {date}
        </span>
        {tags.length > 0 && (
          <div className="flex min-w-0 max-w-[42%] shrink-0 items-center justify-center gap-1 overflow-hidden">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-current/15 px-2 py-0.5 text-[10px] font-medium shadow-sm",
                  READLAB_TAG_COLORS[tag]
                )}
              >
                {READLAB_TAG_LABELS[tag]}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {Object.keys(text.translationMap).length > 0 && (
            <span className="text-[10px] text-primary/50">
              {Object.keys(text.translationMap).length} terms
            </span>
          )}
          {onDelete && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(text.id)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation()
                  onDelete(text.id)
                }
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Delete text"
            >
              <Trash2 className="size-3 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
