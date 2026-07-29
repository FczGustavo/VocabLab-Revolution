"use client"

import { useEffect, useRef, useState } from "react"
import { useStudyTimer } from "@/hooks/use-study-timer"

export function formatStudyElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function useStudyElapsedTime(finished: boolean) {
  const { enabled } = useStudyTimer()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    if (!enabled || finished) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [enabled, finished])

  return { enabled, elapsedSeconds, formatted: formatStudyElapsedTime(elapsedSeconds) }
}
