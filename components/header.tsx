"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, FlaskConical, BookMarked, LayoutGrid, List, LayoutPanelTop, BarChart2, ArrowUp, AlignLeft, AlignJustify, Columns2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "./settings-dialog"
import { useFolder } from "./folder-context"

const navItems = [
  {
    label: "VocabLab",
    href: "/",
    icon: BookOpen,
  },
  {
    label: "RegencyLab",
    href: "/regency",
    icon: FlaskConical,
  },
  {
    label: "RuleLab",
    href: "/rules",
    icon: BookOpen,
  },
  {
    label: "ReadLab",
    href: "/read",
    icon: BookMarked,
  },
  {
    label: "QuestionLab",
    href: "/grammar",
    icon: FlaskConical,
  },
]

function VocabLabIcon({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif", className)}>
      V
    </span>
  )
}

export function Header() {
  const pathname = usePathname()
  const { isInsideFolder, goBack, layout, setLayout, readTextLayout, setReadTextLayout, onShowStats } = useFolder()
  const isReadLab = pathname === "/read"
  const [isHoveringSettings, setIsHoveringSettings] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const settingsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openSettingsTray = () => {
    if (settingsCloseTimerRef.current) clearTimeout(settingsCloseTimerRef.current)
    if (isInsideFolder) setIsHoveringSettings(true)
  }

  const scheduleSettingsTrayClose = () => {
    if (settingsCloseTimerRef.current) clearTimeout(settingsCloseTimerRef.current)
    settingsCloseTimerRef.current = setTimeout(() => setIsHoveringSettings(false), 220)
  }

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => () => {
    if (settingsCloseTimerRef.current) clearTimeout(settingsCloseTimerRef.current)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <>
      <header className="relative z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="mx-auto flex h-[50px] w-full max-w-[1150px] items-center justify-between sm:h-[52px]">
        {/* Logo or Back button */}
        {isInsideFolder ? (
          <button
            type="button"
            onClick={goBack}
            className="flex shrink-0 items-center text-foreground/50 transition-colors hover:text-foreground"
            title="Voltar para página principal"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <Link href="/" className="flex shrink-0 items-center">
            <VocabLabIcon className="text-xl text-foreground/50" />
          </Link>
        )}

        {/* Navigation pills - centered */}
        <nav className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-full border border-border/40 bg-background/60 p-0.5 backdrop-blur-sm">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Settings with hover dropdown */}
        <div className="relative flex items-center">
          <div
            onMouseEnter={openSettingsTray}
            onMouseLeave={scheduleSettingsTrayClose}
            className="relative flex items-center"
          >
            {/* Hover dropdown - vertical, centered with gear */}
            {isInsideFolder && isHoveringSettings && (
              <div
                className="absolute left-1/2 top-full z-50 mt-1 flex -translate-x-1/2 flex-col items-center gap-1 rounded-xl border border-border/40 bg-background/95 p-1.5 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-150"
                onMouseEnter={openSettingsTray}
                onMouseLeave={scheduleSettingsTrayClose}
              >
                <button
                  type="button"
                  onClick={() => { if (isReadLab) setReadTextLayout("original"); else setLayout("grid"); setIsHoveringSettings(false) }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg transition-colors",
                    (isReadLab ? readTextLayout === "original" : layout === "grid")
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={isReadLab ? "Original formatting" : "Cards"}
                >
                  {isReadLab ? <AlignLeft className="size-4" /> : <LayoutGrid className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => { if (isReadLab) setReadTextLayout("justified"); else setLayout("list"); setIsHoveringSettings(false) }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg transition-colors",
                    (isReadLab ? readTextLayout === "justified" : layout === "list")
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={isReadLab ? "Justified text" : "Lista"}
                >
                  {isReadLab ? <AlignJustify className="size-4" /> : <List className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => { if (isReadLab) setReadTextLayout("focused"); else setLayout("compact"); setIsHoveringSettings(false) }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg transition-colors",
                    (isReadLab ? readTextLayout === "focused" : layout === "compact")
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={isReadLab ? "Half-page justified text" : "Compacto"}
                >
                  {isReadLab ? <Columns2 className="size-4" /> : <LayoutPanelTop className="size-4" />}
                </button>
                {!isReadLab && <><div className="h-px w-6 bg-border/40" />
                <button
                  type="button"
                  onClick={() => { onShowStats(); setIsHoveringSettings(false) }}
                  className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="View Progress"
                >
                  <BarChart2 className="size-4" />
                </button></>}
              </div>
            )}

            {/* Settings button - click opens dialog, rotates on hover */}
            <div className={cn(
              "transition-transform duration-300",
              isHoveringSettings && "rotate-90"
            )}>
              <SettingsDialog />
            </div>
          </div>
        </div>
      </div>
    </header>

    {/* Scroll to top button */}
    <button
      type="button"
      onClick={scrollToTop}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex size-10 items-center justify-center rounded-full bg-primary/80 text-primary-foreground shadow-lg transition-all duration-300 hover:bg-primary hover:shadow-xl",
        showScrollTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}
      title="Scroll to top"
    >
      <ArrowUp className="size-5" />
    </button>
    </>
  )
}
