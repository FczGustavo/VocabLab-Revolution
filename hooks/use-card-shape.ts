"use client"

import { useCallback, useEffect, useState } from "react"

const CARD_SHAPE_KEY = "vocablab_square_cards"
const CARD_SHAPE_UPDATED_EVENT = "vocablab-card-shape-updated"

export function useCardShape() {
  const [squareCards, setSquareCardsState] = useState(true)

  const load = useCallback(() => {
    const saved = localStorage.getItem(CARD_SHAPE_KEY)
    setSquareCardsState(saved === null ? true : saved === "true")
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(CARD_SHAPE_UPDATED_EVENT, load)
    return () => window.removeEventListener(CARD_SHAPE_UPDATED_EVENT, load)
  }, [load])

  const setSquareCards = useCallback((value: boolean) => {
    localStorage.setItem(CARD_SHAPE_KEY, String(value))
    setSquareCardsState(value)
    window.dispatchEvent(new Event(CARD_SHAPE_UPDATED_EVENT))
  }, [])

  return { squareCards, setSquareCards }
}
