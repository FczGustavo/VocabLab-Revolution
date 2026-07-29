"use client"

import { useCallback, useEffect, useState } from "react"
import type { RegencyCard, RegencyFolder } from "@/lib/types"
import { REGENCYLAB_CARDS_UPDATED_EVENT } from "@/lib/constants"
import {
  REGENCY_DEFAULT_CATALOG,
  REGENCY_DEFAULT_CATALOG_VERSION,
  REGENCY_DEFAULT_FOLDER_COLOR,
  REGENCY_DEFAULT_FOLDER_NAME,
  regencyCatalogContentHash,
  validateRegencyDefaultCatalog,
} from "@/lib/regency-default-catalog"

const DB_NAME = "regencylab-db"
const DB_VERSION = 2
const CARDS_STORE = "cards"
const FOLDERS_STORE = "folders"
const META_STORE = "catalogMeta"
const DEFAULT_CATALOG_META_KEY = "regency-default-catalog"
const FOLDER_COLORS_UPDATED_EVENT = "regencylab-folder-colors-updated"

interface RegencyCatalogMeta {
  key: typeof DEFAULT_CATALOG_META_KEY
  version: number
  folderId: string | null
  seenCatalogIds: string[]
}

function notifyUpdated() {
  if (typeof window !== "undefined") {
    window.setTimeout(() => window.dispatchEvent(new Event(REGENCYLAB_CARDS_UPDATED_EVENT)), 0)
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(CARDS_STORE)) {
        const cards = db.createObjectStore(CARDS_STORE, { keyPath: "id" })
        cards.createIndex("folderId", "folderId", { unique: false })
        cards.createIndex("createdAt", "createdAt", { unique: false })
        cards.createIndex("catalogId", "catalogId", { unique: false })
      } else {
        const cards = request.transaction?.objectStore(CARDS_STORE)
        if (cards && !cards.indexNames.contains("catalogId")) cards.createIndex("catalogId", "catalogId", { unique: false })
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const folders = db.createObjectStore(FOLDERS_STORE, { keyPath: "id" })
        folders.createIndex("name", "name", { unique: true })
        folders.createIndex("createdAt", "createdAt", { unique: false })
      }
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" })
    }
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
  })
}

function applyDefaultGeneralPreferences() {
  try {
    const colorKey = "regencylab_folder_colors"
    const nameKey = "regencylab_general_folder_name"
    const stored = localStorage.getItem(colorKey)
    const colors = stored ? JSON.parse(stored) as Record<string, string> : {}
    if (!localStorage.getItem(nameKey)) localStorage.setItem(nameKey, REGENCY_DEFAULT_FOLDER_NAME)
    if (!colors.__general__) localStorage.setItem(colorKey, JSON.stringify({ ...colors, __general__: REGENCY_DEFAULT_FOLDER_COLOR }))
    window.dispatchEvent(new Event(FOLDER_COLORS_UPDATED_EVENT))
  } catch {
    // A malformed preference must not prevent the atomic catalog installation.
  }
}

async function ensureDefaultCatalog(db: IDBDatabase): Promise<void> {
  validateRegencyDefaultCatalog()
  const transaction = db.transaction([CARDS_STORE, FOLDERS_STORE, META_STORE], "readwrite")
  const done = transactionComplete(transaction)
  const cardsStore = transaction.objectStore(CARDS_STORE)
  const foldersStore = transaction.objectStore(FOLDERS_STORE)
  const metaStore = transaction.objectStore(META_STORE)
  const [cards, folders, existingMeta] = await Promise.all([
    requestResult(cardsStore.getAll()) as Promise<RegencyCard[]>,
    requestResult(foldersStore.getAll()) as Promise<RegencyFolder[]>,
    requestResult(metaStore.get(DEFAULT_CATALOG_META_KEY)) as Promise<RegencyCatalogMeta | undefined>,
  ])

  const now = Date.now()
  const firstInstallation = !existingMeta
  const legacyFolderId = existingMeta?.folderId ?? null
  const legacyFolder = legacyFolderId ? folders.find((folder) => folder.id === legacyFolderId) : undefined
  const canMigrateLegacyFolder = Boolean(
    existingMeta
    && existingMeta.version < REGENCY_DEFAULT_CATALOG_VERSION
    && legacyFolder
    && legacyFolder.name === REGENCY_DEFAULT_FOLDER_NAME
    && !cards.some((card) => card.folderId === legacyFolderId && !card.catalogId),
  )
  if (canMigrateLegacyFolder && legacyFolderId) foldersStore.delete(legacyFolderId)
  const folderId = canMigrateLegacyFolder ? null : legacyFolderId
  const destinationFolderId = folderId && folders.some((folder) => folder.id === folderId) ? folderId : null
  const seen = new Set(existingMeta?.seenCatalogIds ?? [])
  const cardsByCatalogId = new Map(cards.filter((card) => card.catalogId).map((card) => [card.catalogId as string, card]))

  REGENCY_DEFAULT_CATALOG.forEach((entry, index) => {
    const canonicalHash = regencyCatalogContentHash(entry)
    const current = cardsByCatalogId.get(entry.catalogId)
    if (current) {
      seen.add(entry.catalogId)
      const currentHash = regencyCatalogContentHash(current)
      const isUntouched = Boolean(current.catalogContentHash) && currentHash === current.catalogContentHash
      const moveFromLegacyFolder = canMigrateLegacyFolder && current.folderId === legacyFolderId
      if (moveFromLegacyFolder || (isUntouched && (current.catalogContentHash !== canonicalHash || current.catalogRevision !== entry.catalogRevision))) {
        cardsStore.put({
          ...current,
          ...(isUntouched ? entry : {}),
          ...(isUntouched ? { catalogContentHash: canonicalHash } : {}),
          ...(moveFromLegacyFolder ? { folderId: null } : {}),
          updatedAt: now,
        })
      }
      return
    }
    if (seen.has(entry.catalogId)) return
    const createdAt = now - index
    cardsStore.add({
      ...entry,
      id: crypto.randomUUID(),
      catalogContentHash: canonicalHash,
      folderId: destinationFolderId,
      createdAt,
      updatedAt: createdAt,
    } satisfies RegencyCard)
    seen.add(entry.catalogId)
  })

  metaStore.put({
    key: DEFAULT_CATALOG_META_KEY,
    version: REGENCY_DEFAULT_CATALOG_VERSION,
    folderId,
    seenCatalogIds: [...seen],
  } satisfies RegencyCatalogMeta)
  await done
  if (firstInstallation || canMigrateLegacyFolder) applyDefaultGeneralPreferences()
}

export function useRegencyDB() {
  const [allCards, setAllCards] = useState<RegencyCard[]>([])
  const [folders, setFolders] = useState<RegencyFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const db = await openDatabase()
      await ensureDefaultCatalog(db)
      const transaction = db.transaction([CARDS_STORE, FOLDERS_STORE], "readonly")
      const cardsRequest = transaction.objectStore(CARDS_STORE).getAll()
      const foldersRequest = transaction.objectStore(FOLDERS_STORE).getAll()
      cardsRequest.onsuccess = () => {
        setAllCards((cardsRequest.result as RegencyCard[]).sort((a, b) => b.createdAt - a.createdAt))
        setIsLoading(false)
      }
      cardsRequest.onerror = () => setIsLoading(false)
      foldersRequest.onsuccess = () => setFolders((foldersRequest.result as RegencyFolder[]).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
    } catch (error) {
      console.error("Could not load RegencyLab data:", error)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    const refresh = () => void loadData()
    window.addEventListener(REGENCYLAB_CARDS_UPDATED_EVENT, refresh)
    return () => window.removeEventListener(REGENCYLAB_CARDS_UPDATED_EVENT, refresh)
  }, [loadData])

  const addFolder = useCallback(async (name: string) => {
    const folder: RegencyFolder = { id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now() }
    if (!folder.name) return null
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(FOLDERS_STORE, "readwrite").objectStore(FOLDERS_STORE).add(folder)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      setFolders((current) => [...current, folder].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
      notifyUpdated()
      return folder
    } catch {
      return null
    }
  }, [])

  const renameFolder = useCallback(async (id: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return false
    try {
      const db = await openDatabase()
      const tx = db.transaction(FOLDERS_STORE, "readwrite")
      const store = tx.objectStore(FOLDERS_STORE)
      const current = await new Promise<RegencyFolder | undefined>((resolve, reject) => {
        const request = store.get(id)
        request.onsuccess = () => resolve(request.result as RegencyFolder | undefined)
        request.onerror = () => reject(request.error)
      })
      if (!current) return false
      const updated = { ...current, name: nextName }
      await new Promise<void>((resolve, reject) => {
        const request = store.put(updated)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      setFolders((items) => items.map((item) => item.id === id ? updated : item).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
      notifyUpdated()
      return true
    } catch { return false }
  }, [])

  const addCard = useCallback(async (card: Omit<RegencyCard, "id" | "folderId" | "createdAt" | "updatedAt">) => {
    const term = card.term.trim()
    const pattern = card.pattern.trim()
    const example = card.example.trim()
    const folderId = selectedFolderId === "__general__" ? null : selectedFolderId
    if (!term || !pattern || !example || !selectedFolderId) return { ok: false, error: "Complete the term, pattern and example first." }
    const duplicate = allCards.some((item) => item.folderId === folderId && item.term.toLowerCase() === term.toLowerCase() && item.pattern.toLowerCase() === pattern.toLowerCase())
    if (duplicate) return { ok: false, error: "This pattern already exists in this folder." }
    const now = Date.now()
    const newCard: RegencyCard = { ...card, id: crypto.randomUUID(), term, pattern, example, exampleTranslation: card.exampleTranslation?.trim() || undefined, meaningPt: card.meaningPt?.trim() || undefined, contrastPt: card.contrastPt?.trim() || undefined, folderId, createdAt: now, updatedAt: now }
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(CARDS_STORE, "readwrite").objectStore(CARDS_STORE).add(newCard)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      setAllCards((items) => [newCard, ...items])
      notifyUpdated()
      return { ok: true, card: newCard }
    } catch { return { ok: false, error: "Could not save this card." } }
  }, [allCards, selectedFolderId])

  const updateCard = useCallback(async (card: RegencyCard) => {
    const updated = { ...card, term: card.term.trim(), pattern: card.pattern.trim(), example: card.example.trim(), exampleTranslation: card.exampleTranslation?.trim() || undefined, meaningPt: card.meaningPt?.trim() || undefined, contrastPt: card.contrastPt?.trim() || undefined, updatedAt: Date.now() }
    if (!updated.term || !updated.pattern || !updated.example) return false
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(CARDS_STORE, "readwrite").objectStore(CARDS_STORE).put(updated)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      setAllCards((items) => items.map((item) => item.id === updated.id ? updated : item))
      notifyUpdated()
      return true
    } catch { return false }
  }, [])

  const deleteCard = useCallback(async (id: string) => {
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(CARDS_STORE, "readwrite").objectStore(CARDS_STORE).delete(id)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      setAllCards((items) => items.filter((item) => item.id !== id))
      notifyUpdated()
      return true
    } catch { return false }
  }, [])

  const deleteCardsInFolder = useCallback(async (folderId: string | null) => {
    const ids = allCards.filter((card) => card.folderId === folderId).map((card) => card.id)
    if (!ids.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CARDS_STORE, "readwrite")
        const store = transaction.objectStore(CARDS_STORE)
        ids.forEach((id) => store.delete(id))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      const deleted = new Set(ids)
      setAllCards((items) => items.filter((card) => !deleted.has(card.id)))
      notifyUpdated()
      return true
    } catch { return false }
  }, [allCards])

  const moveCards = useCallback(async (fromFolderId: string | null, toFolderId: string | null) => {
    const moving = allCards.filter((card) => card.folderId === fromFolderId).map((card) => ({ ...card, folderId: toFolderId, updatedAt: Date.now() }))
    if (!moving.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CARDS_STORE, "readwrite")
        moving.forEach((card) => tx.objectStore(CARDS_STORE).put(card))
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      setAllCards((items) => items.map((card) => moving.find((item) => item.id === card.id) ?? card))
      notifyUpdated()
      return true
    } catch { return false }
  }, [allCards])

  const deleteFolder = useCallback(async (id: string) => {
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(FOLDERS_STORE, "readwrite").objectStore(FOLDERS_STORE).delete(id)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      setFolders((items) => items.filter((item) => item.id !== id))
      if (selectedFolderId === id) setSelectedFolderId(null)
      notifyUpdated()
      return true
    } catch { return false }
  }, [selectedFolderId])

  const addToReviewFolder = useCallback(async (id: string) => {
    const card = allCards.find((item) => item.id === id)
    if (!card || card.isReviewFolder) return false
    return updateCard({ ...card, isReviewFolder: true })
  }, [allCards, updateCard])

  const removeFromReviewFolder = useCallback(async (id: string) => {
    const card = allCards.find((item) => item.id === id)
    if (!card || !card.isReviewFolder) return false
    return updateCard({ ...card, isReviewFolder: false })
  }, [allCards, updateCard])

  const cards = selectedFolderId
    ? allCards.filter((card) => selectedFolderId === "__general__" ? !card.folderId : card.folderId === selectedFolderId)
    : allCards
  const reviewCards = allCards.filter((card) => card.isReviewFolder)

  return { allCards, cards, reviewCards, folders, selectedFolderId, setSelectedFolderId, isLoading, addFolder, renameFolder, deleteFolder, addCard, updateCard, deleteCard, deleteCardsInFolder, moveCards, addToReviewFolder, removeFromReviewFolder, refresh: loadData }
}
