"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { usePathname } from "next/navigation"

export type ReadTextLayout = "original" | "justified" | "focused"
type CardLayout = "grid" | "list" | "compact"

const CARD_LAYOUT_KEYS = {
  vocabulary: "vocab-lab-card-layout",
  regency: "regency-lab-card-layout",
  rule: "rule-lab-card-layout",
} as const
const READ_TEXT_LAYOUT_KEY = "read-lab-text-layout"

function isCardLayout(value: string | null): value is CardLayout {
  return value === "grid" || value === "list" || value === "compact"
}

function isReadTextLayout(value: string | null): value is ReadTextLayout {
  return value === "original" || value === "justified" || value === "focused"
}

interface FolderContextType {
  isInsideFolder: boolean
  setIsInsideFolder: (value: boolean) => void
  goBack: () => void
  setGoBack: (fn: () => void) => void
  layout: CardLayout
  setLayout: (layout: CardLayout) => void
  readTextLayout: ReadTextLayout
  setReadTextLayout: (layout: ReadTextLayout) => void
  onShowStats: () => void
  setOnShowStats: (fn: () => void) => void
}

const FolderContext = createContext<FolderContextType>({
  isInsideFolder: false,
  setIsInsideFolder: () => {},
  goBack: () => {},
  setGoBack: () => {},
  layout: "grid",
  setLayout: () => {},
  readTextLayout: "original",
  setReadTextLayout: () => {},
  onShowStats: () => {},
  setOnShowStats: () => {},
})

export function FolderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isInsideFolder, setIsInsideFolder] = useState(false)
  const [layout, setLayoutState] = useState<CardLayout>("grid")
  const [readTextLayout, setReadTextLayout] = useState<ReadTextLayout>("original")
  const goBackRef = useRef<() => void>(() => {})
  const onShowStatsRef = useRef<() => void>(() => {})

  const cardLayoutKey = pathname === "/regency" ? CARD_LAYOUT_KEYS.regency : pathname === "/rules" ? CARD_LAYOUT_KEYS.rule : CARD_LAYOUT_KEYS.vocabulary

  useEffect(() => {
    if (pathname === "/read") {
      const saved = window.localStorage.getItem(READ_TEXT_LAYOUT_KEY)
      if (isReadTextLayout(saved)) setReadTextLayout(saved)
      return
    }

    const saved = window.localStorage.getItem(cardLayoutKey)
    if (isCardLayout(saved)) setLayoutState(saved)
  }, [pathname, cardLayoutKey])

  const setLayout = useCallback((nextLayout: CardLayout) => {
    setLayoutState(nextLayout)
    window.localStorage.setItem(cardLayoutKey, nextLayout)
  }, [cardLayoutKey])

  const setPersistedReadTextLayout = useCallback((nextLayout: ReadTextLayout) => {
    setReadTextLayout(nextLayout)
    window.localStorage.setItem(READ_TEXT_LAYOUT_KEY, nextLayout)
  }, [])

  const setGoBack = useCallback((fn: () => void) => {
    goBackRef.current = fn
  }, [])

  const goBack = useCallback(() => {
    goBackRef.current()
  }, [])

  const setOnShowStats = useCallback((fn: () => void) => {
    onShowStatsRef.current = fn
  }, [])

  const onShowStats = useCallback(() => {
    onShowStatsRef.current()
  }, [])

  return (
    <FolderContext.Provider value={{ isInsideFolder, setIsInsideFolder, goBack, setGoBack, layout, setLayout, readTextLayout, setReadTextLayout: setPersistedReadTextLayout, onShowStats, setOnShowStats }}>
      {children}
    </FolderContext.Provider>
  )
}

export function useFolder() {
  return useContext(FolderContext)
}
