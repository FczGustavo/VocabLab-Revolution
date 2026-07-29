import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Flashcard } from "@/lib/types"

export function VerbTypeBadge({
  verbType,
  compact = false,
  className,
}: {
  verbType?: Flashcard["verbType"]
  compact?: boolean
  className?: string
}) {
  if (!verbType) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        "ghost-tag border-0 bg-primary/10 font-medium leading-none text-primary dark:bg-zinc-600 dark:text-white",
        compact ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]",
        className,
      )}
    >
      {compact
        ? verbType === "regular" ? "Reg" : "Irreg"
        : verbType === "regular" ? "Regular" : "Irregular"}
    </Badge>
  )
}
