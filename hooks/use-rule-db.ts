"use client"

import { useCallback, useEffect, useState } from "react"
import type { RuleCard, RuleFolder } from "@/lib/types"
import { RULELAB_CARDS_UPDATED_EVENT } from "@/lib/constants"
import { recordSyncTombstone } from "@/lib/sync-tombstones"

const DB_NAME = "rulelab-db"
const DB_VERSION = 2
const CARDS_STORE = "cards"
const FOLDERS_STORE = "folders"
const META_STORE = "meta"
const INITIAL_GENERAL_META_KEY = "initial-general-folder"

interface InitialGeneralMeta {
  key: typeof INITIAL_GENERAL_META_KEY
  folderId: string
}

function notifyUpdated() {
  window.setTimeout(() => window.dispatchEvent(new Event(RULELAB_CARDS_UPDATED_EVENT)), 0)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CARDS_STORE)) {
        const cards = db.createObjectStore(CARDS_STORE, { keyPath: "id" })
        cards.createIndex("folderId", "folderId", { unique: false })
        cards.createIndex("createdAt", "createdAt", { unique: false })
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const folders = db.createObjectStore(FOLDERS_STORE, { keyPath: "id" })
        folders.createIndex("createdAt", "createdAt", { unique: false })
      }
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" })
    }
  })
}

async function ensureInitialGeneralFolder(db: IDBDatabase) {
  const transaction = db.transaction([FOLDERS_STORE, META_STORE], "readwrite")
  const metaStore = transaction.objectStore(META_STORE)
  const meta = await new Promise<InitialGeneralMeta | undefined>((resolve, reject) => {
    const request = metaStore.get(INITIAL_GENERAL_META_KEY)
    request.onsuccess = () => resolve(request.result as InitialGeneralMeta | undefined)
    request.onerror = () => reject(request.error)
  })
  if (!meta) {
    const folder: RuleFolder = { id: crypto.randomUUID(), name: "General", createdAt: Date.now() }
    transaction.objectStore(FOLDERS_STORE).add(folder)
    metaStore.put({ key: INITIAL_GENERAL_META_KEY, folderId: folder.id } satisfies InitialGeneralMeta)
  }
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function write<T>(storeName: string, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite")
    const request = operation(transaction.objectStore(storeName))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => {
      db.close()
      resolve(result)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      db.close()
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
    }
  }))
}

export function useRuleDB() {
  const [allCards, setAllCards] = useState<RuleCard[]>([])
  const [folders, setFolders] = useState<RuleFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const db = await openDatabase()
      await ensureInitialGeneralFolder(db)
      const transaction = db.transaction([CARDS_STORE, FOLDERS_STORE], "readonly")
      const cardsRequest = transaction.objectStore(CARDS_STORE).getAll()
      const foldersRequest = transaction.objectStore(FOLDERS_STORE).getAll()
      cardsRequest.onsuccess = () => {
        setAllCards((cardsRequest.result as RuleCard[]).sort((a, b) => b.createdAt - a.createdAt))
        setIsLoading(false)
      }
      cardsRequest.onerror = () => setIsLoading(false)
      foldersRequest.onsuccess = () => setFolders((foldersRequest.result as RuleFolder[]).sort((a, b) => a.createdAt - b.createdAt))
    } catch {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    const refresh = () => void loadData()
    window.addEventListener(RULELAB_CARDS_UPDATED_EVENT, refresh)
    return () => window.removeEventListener(RULELAB_CARDS_UPDATED_EVENT, refresh)
  }, [loadData])

  const addFolder = useCallback(async (name: string) => {
    const now = Date.now()
    const folder: RuleFolder = { id: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now }
    if (!folder.name) return null
    try {
      await write(FOLDERS_STORE, (store) => store.add(folder))
      setFolders((current) => [...current, folder])
      notifyUpdated()
      return folder
    } catch { return null }
  }, [])

  const renameFolder = useCallback(async (id: string, name: string) => {
    const current = folders.find((folder) => folder.id === id)
    const nextName = name.trim()
    if (!current || !nextName) return false
    const updated = { ...current, name: nextName, updatedAt: Date.now() }
    try {
      await write(FOLDERS_STORE, (store) => store.put(updated))
      setFolders((items) => items.map((item) => item.id === id ? updated : item))
      notifyUpdated()
      return true
    } catch { return false }
  }, [folders])

  const deleteFolder = useCallback(async (id: string) => {
    try {
      await write(FOLDERS_STORE, (store) => store.delete(id))
      setFolders((items) => items.filter((item) => item.id !== id))
      recordSyncTombstone("rule", FOLDERS_STORE, id)
      if (selectedFolderId === id) setSelectedFolderId(null)
      notifyUpdated()
      return true
    } catch { return false }
  }, [selectedFolderId])

  const addCard = useCallback(async (front: string, back: string) => {
    const cleanedFront = front.trim()
    const cleanedBack = back.trim()
    if (!selectedFolderId || !cleanedFront || !cleanedBack) return { ok: false, error: "Complete both sides of the card." }
    const duplicate = allCards.some((card) => card.folderId === selectedFolderId && card.front.toLocaleLowerCase() === cleanedFront.toLocaleLowerCase())
    if (duplicate) return { ok: false, error: "A card with this front already exists in this folder." }
    const now = Date.now()
    const card: RuleCard = { id: crypto.randomUUID(), front: cleanedFront, back: cleanedBack, folderId: selectedFolderId, createdAt: now, updatedAt: now }
    try {
      await write(CARDS_STORE, (store) => store.add(card))
      setAllCards((items) => [card, ...items])
      notifyUpdated()
      return { ok: true, card }
    } catch { return { ok: false, error: "Could not save this card." } }
  }, [allCards, selectedFolderId])

  const updateCard = useCallback(async (card: RuleCard) => {
    const updated = { ...card, front: card.front.trim(), back: card.back.trim(), updatedAt: Date.now() }
    if (!updated.front || !updated.back) return false
    try {
      await write(CARDS_STORE, (store) => store.put(updated))
      setAllCards((items) => items.map((item) => item.id === updated.id ? updated : item))
      notifyUpdated()
      return true
    } catch { return false }
  }, [])

  const deleteCard = useCallback(async (id: string) => {
    try {
      await write(CARDS_STORE, (store) => store.delete(id))
      setAllCards((items) => items.filter((item) => item.id !== id))
      recordSyncTombstone("rule", CARDS_STORE, id)
      notifyUpdated()
      return true
    } catch { return false }
  }, [])

  const deleteCardsInFolder = useCallback(async (folderId: string) => {
    const ids = allCards.filter((card) => card.folderId === folderId).map((card) => card.id)
    if (!ids.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CARDS_STORE, "readwrite")
        ids.forEach((id) => transaction.objectStore(CARDS_STORE).delete(id))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      setAllCards((items) => items.filter((card) => !ids.includes(card.id)))
      ids.forEach((id) => recordSyncTombstone("rule", CARDS_STORE, id))
      notifyUpdated()
      return true
    } catch { return false }
  }, [allCards])

  const moveCards = useCallback(async (fromFolderId: string, toFolderId: string) => {
    const moving = allCards.filter((card) => card.folderId === fromFolderId).map((card) => ({ ...card, folderId: toFolderId, updatedAt: Date.now() }))
    if (!moving.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CARDS_STORE, "readwrite")
        moving.forEach((card) => transaction.objectStore(CARDS_STORE).put(card))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      setAllCards((items) => items.map((card) => moving.find((item) => item.id === card.id) ?? card))
      notifyUpdated()
      return true
    } catch { return false }
  }, [allCards])

  const addToReviewFolder = useCallback(async (id: string) => {
    const card = allCards.find((item) => item.id === id)
    return card && !card.isReviewFolder ? updateCard({ ...card, isReviewFolder: true }) : false
  }, [allCards, updateCard])

  const removeFromReviewFolder = useCallback(async (id: string) => {
    const card = allCards.find((item) => item.id === id)
    return card?.isReviewFolder ? updateCard({ ...card, isReviewFolder: false }) : false
  }, [allCards, updateCard])
  const recordStudyResult = useCallback(async (id: string, knewIt: boolean) => {
    const card = allCards.find((item) => item.id === id)
    return card ? updateCard({ ...card, studyStreak: knewIt ? (card.studyStreak ?? 0) + 1 : 0 }) : false
  }, [allCards, updateCard])

  const cards = selectedFolderId ? allCards.filter((card) => card.folderId === selectedFolderId) : allCards
  const reviewCards = allCards.filter((card) => card.isReviewFolder)
  return { allCards, cards, reviewCards, folders, selectedFolderId, setSelectedFolderId, isLoading, addFolder, renameFolder, deleteFolder, addCard, updateCard, deleteCard, deleteCardsInFolder, moveCards, addToReviewFolder, removeFromReviewFolder, recordStudyResult }
}
