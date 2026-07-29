"use client"

import { FileText, Image, File, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReadLabText, ReadLabTag } from "@/lib/types"
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
        "group relative flex w-full flex-col overflow-hidden rounded-2xl border transition-all duration-300",
        "border-border/40 bg-card/80 hover:border-primary/20 hover:shadow-md",
        layout === "list" && "flex-row items-center gap-4 p-4",
        layout === "compact" && "p-3",
        layout === "grid" && "min-h-[168px] p-4"
      )}
    >
      {/* Header: icon + title + subtitle */}
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="size-3.5 text-primary/70" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <h3 className={cn(
            "break-words font-semibold leading-snug text-foreground/90",
            layout === "compact" ? "text-[13px]" : "text-sm"
          )}>
            {text.title}
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground/55">
            {sourceLabels[text.sourceType]} · {wordCount} words
          </p>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                READLAB_TAG_COLORS[tag]
              )}
            >
              {READLAB_TAG_LABELS[tag]}
            </span>
          ))}
        </div>
      )}

      {/* Preview */}
      {layout !== "compact" && (
        <p className={cn(
          "mt-2.5 text-[12px] leading-5 text-muted-foreground/70 line-clamp-2",
          layout === "list" && "mt-0 line-clamp-2"
        )}>
          {preview}
        </p>
      )}

      {/* Footer: date + translated count + delete */}
      <div className={cn(
        "mt-auto pt-2.5 flex items-center justify-between",
        layout === "compact" && "pt-2"
      )}>
        <span className="text-[10px] text-muted-foreground/40">
          {date}
        </span>
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
