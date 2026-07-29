"use client"

import { useState, useRef, useCallback } from "react"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LongPressButtonProps {
  onLongPress: () => void
  duration?: number
  className?: string
  children?: React.ReactNode
}

export function LongPressButton({ 
  onLongPress, 
  duration = 800, 
  className,
  children 
}: LongPressButtonProps) {
  const [isPressed, setIsPressed] = useState(false)
  const [progress, setProgress] = useState(0)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const startLongPress = useCallback(() => {
    setIsPressed(true)
    setProgress(0)
    
    const startTime = Date.now()
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const prog = Math.min(elapsed / duration, 1)
      setProgress(prog)
    }, 16)
    
    longPressTimerRef.current = setTimeout(() => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      setProgress(1)
      setIsPressed(false)
      onLongPress()
    }, duration)
  }, [onLongPress, duration])

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setIsPressed(false)
    setProgress(0)
  }, [])

  return (
    <button
      type="button"
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
      className={cn(
        "relative overflow-hidden transition-all",
        className
      )}
    >
      {/* Progress overlay */}
      {isPressed && (
        <div 
          className="absolute inset-0 bg-destructive/20 transition-opacity"
          style={{ opacity: progress * 0.8 }}
        />
      )}
      
      {/* Progress bar at bottom */}
      {isPressed && (
        <div className="absolute bottom-0 left-0 h-1 bg-destructive transition-all duration-100" 
             style={{ width: `${progress * 100}%` }} />
      )}
      
      {/* Content */}
      <div className="relative flex items-center justify-center gap-2">
        {children || (
          <>
            <Trash2 className="size-4 text-muted-foreground" />
            <span>Hold to delete</span>
          </>
        )}
      </div>
    </button>
  )
}
