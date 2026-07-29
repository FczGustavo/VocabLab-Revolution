import { Badge } from "@/components/ui/badge"
import { grammaticalFormLabels } from "@/lib/grammatical-forms"
import type { GrammaticalForm } from "@/lib/types"
import { cn } from "@/lib/utils"

export function GrammaticalFormBadge({
  form,
  compact = false,
  className,
}: {
  form?: GrammaticalForm
  compact?: boolean
  className?: string
}) {
  if (!form) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        "ghost-tag border-border/50 bg-muted/45 font-medium text-muted-foreground dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300",
        compact
          ? "h-4 px-1.5 text-[9px] leading-none"
          : "h-5 px-2 text-[10px] leading-none",
        className,
      )}
    >
      {grammaticalFormLabels[form]}
    </Badge>
  )
}
