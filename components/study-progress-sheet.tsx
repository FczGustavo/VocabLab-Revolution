"use client"

import { BarChart2, BookOpen, Calendar, CalendarDays, CheckCircle2, Flame, GraduationCap, Layers3, Target, Timer, TrendingUp, XCircle } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useGrammarProgress, type StudyLab } from "@/hooks/use-grammar-progress"
import { cn } from "@/lib/utils"

type ProgressCard = {
  id: string
  isReviewFolder?: boolean
  studyStreak?: number
}

export function StudyProgressSheet({
  open,
  onOpenChange,
  cards,
  folderName,
  folderId,
  lab,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cards: ProgressCard[]
  folderName: string
  folderId?: string | null
  lab: StudyLab
}) {
  const { getStudyStats, isLoaded } = useGrammarProgress()
  const stats = getStudyStats({ lab, folderName, folderId })
  const mastered = cards.filter((card) => (card.studyStreak ?? 0) >= 3).length
  const review = cards.filter((card) => card.isReviewFolder).length
  const coverage = cards.length ? Math.round((mastered / cards.length) * 100) : 0
  const topStats = [
    { icon: Layers3, label: "No deck", value: cards.length, tone: "text-primary/70" },
    { icon: Target, label: "No Review", value: review, tone: "text-amber-500/80" },
    { icon: Flame, label: "Mastered", value: mastered, tone: "text-success/80" },
    { icon: TrendingUp, label: "Cobertura", value: `${coverage}%`, tone: "text-primary/70" },
  ]
  const sessionStats = [
    { icon: Calendar, label: "Sessões", value: stats.totalSessions, tone: "text-primary/70" },
    { icon: GraduationCap, label: "Cards estudados", value: stats.totalCards, tone: "text-primary/70" },
    { icon: BookOpen, label: "Cards únicos", value: stats.uniqueCardsStudied, tone: "text-primary/70" },
    { icon: CheckCircle2, label: "Acertos 1ª", value: stats.totalCorrectFirstTry, tone: "text-success/80" },
    { icon: TrendingUp, label: "Precisão média", value: `${stats.averageAccuracy}%`, tone: "text-primary/70" },
    { icon: XCircle, label: "Again", value: stats.totalMistakes, tone: "text-destructive/80" },
    { icon: Target, label: "Cards com erro", value: stats.mistakeCards, tone: "text-amber-500/80" },
    { icon: Timer, label: "Tempo total", value: `${stats.totalStudyMinutes} min`, tone: "text-primary/70" },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] max-w-md p-0 sm:w-[26rem]">
        <SheetHeader className="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
          <SheetTitle className="flex items-center gap-2 text-[15px] leading-none">
            <BarChart2 className="size-4 shrink-0 text-primary" />
            Study Progress
          </SheetTitle>
          <p className="truncate text-left text-xs text-muted-foreground" title={folderName}>{folderName}</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
          <div className="space-y-5 p-5">
            <section className="grid grid-cols-2 gap-3">
              {topStats.map((stat) => (
                <div key={stat.label} className="stat-bento min-h-[98px] flex-col items-center justify-between gap-2 px-3 py-3 text-center">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10"><stat.icon className={cn("size-3.5", stat.tone)} /></div>
                  <div className="flex w-full min-w-0 flex-col items-center gap-1"><p className="text-2xl font-bold leading-none tracking-[-0.03em] tabular-nums">{stat.value}</p><p className="max-w-full line-clamp-2 break-words text-[10px] uppercase leading-3 tracking-[0.07em] text-muted-foreground [overflow-wrap:anywhere]">{stat.label}</p></div>
                </div>
              ))}
            </section>
            {!isLoaded || stats.totalSessions === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/20 p-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted"><BarChart2 className="size-6 text-muted-foreground" /></div>
                <p className="text-sm text-muted-foreground">Ainda não há sessões salvas nesta pasta.</p>
              </div>
            ) : (
              <>
                <section className="grid grid-cols-2 gap-3">
                  {sessionStats.map((stat) => (
                    <div key={stat.label} className="stat-bento min-h-[92px] flex-col items-center justify-between gap-2 px-3 py-3 text-center">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10"><stat.icon className={cn("size-3.5", stat.tone)} /></div>
                      <div className="flex w-full min-w-0 flex-col items-center gap-1"><p className="text-xl font-bold leading-none tracking-[-0.03em] tabular-nums">{stat.value}</p><p className="max-w-full line-clamp-2 break-words text-[10px] uppercase leading-3 tracking-[0.07em] text-muted-foreground [overflow-wrap:anywhere]">{stat.label}</p></div>
                    </div>
                  ))}
                </section>
                <section className="rounded-2xl border border-border/40 bg-card/60 p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-foreground/80">Ritmo recente</p><p className="mt-1 text-[11px] text-muted-foreground">{stats.sessionsLast7Days} sessões nos últimos 7 dias · {stats.daysStudied} dias estudados</p></div><CalendarDays className="size-4 text-primary/70" /></div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]"><div><span className="text-muted-foreground">Média por sessão</span><p className="mt-1 text-sm font-semibold tabular-nums">{stats.averageSessionCards} cards</p></div><div><span className="text-muted-foreground">Melhor precisão</span><p className="mt-1 text-sm font-semibold tabular-nums">{stats.bestAccuracy}%</p></div></div>
                </section>
              </>
            )}
            <p className="text-[11px] text-muted-foreground">As métricas desta janela consideram somente a pasta atual e o histórico de estudo deste Lab.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
