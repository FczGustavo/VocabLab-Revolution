"use client"

import { useCallback, useEffect, useState } from "react"
import type { RuleCard, RuleFolder, RuleTheoryBlock, RuleTheoryDocument } from "@/lib/types"
import { RULELAB_CARDS_UPDATED_EVENT } from "@/lib/constants"
import { recordSyncTombstone } from "@/lib/sync-tombstones"
import { isSyncStudyOnly } from "@/lib/sync-device"
import { normalizeTheoryDocument } from "@/lib/rule-theory"

const DB_NAME = "rulelab-db"
const DB_VERSION = 3
const CARDS_STORE = "cards"
const FOLDERS_STORE = "folders"
const THEORY_STORE = "theoryDocuments"
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
      if (!db.objectStoreNames.contains(THEORY_STORE)) {
        const theory = db.createObjectStore(THEORY_STORE, { keyPath: "id" })
        theory.createIndex("folderId", "folderId", { unique: false })
        theory.createIndex("updatedAt", "updatedAt", { unique: false })
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
    const folder: RuleFolder = { id: crypto.randomUUID(), name: "General", kind: "cards", createdAt: Date.now() }
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

async function readRuleCardById(id: string): Promise<RuleCard | undefined> {
  const db = await openDatabase()
  return new Promise((resolve) => {
    const request = db.transaction(CARDS_STORE, "readonly").objectStore(CARDS_STORE).get(id)
    request.onsuccess = () => { db.close(); resolve(request.result as RuleCard | undefined) }
    request.onerror = () => { db.close(); resolve(undefined) }
  })
}

async function recoverOrphanTheoryDocuments(documents: RuleTheoryDocument[], existingFolders: RuleFolder[]) {
  const theoryFolderIds = new Set(existingFolders.filter((folder) => (folder.kind ?? "cards") === "theory").map((folder) => folder.id))
  const orphans = documents.filter((document) => !theoryFolderIds.has(document.folderId))
  if (!orphans.length) return
  const now = Date.now()
  const recoveryFolder = existingFolders.find((folder) => folder.kind === "theory" && folder.name === "Recovered theory notes") ?? {
    id: crypto.randomUUID(),
    name: "Recovered theory notes",
    kind: "theory" as const,
    createdAt: now,
    updatedAt: now,
  }
  if (!existingFolders.some((folder) => folder.id === recoveryFolder.id)) await write(FOLDERS_STORE, (store) => store.add(recoveryFolder))
  await Promise.all(orphans.map((document) => write(THEORY_STORE, (store) => store.put({ ...document, folderId: recoveryFolder.id, updatedAt: Date.now() }))))
  return { recoveryFolder, recoveredIds: new Set(orphans.map((document) => document.id)) }
}

export function useRuleDB() {
  const [allCards, setAllCards] = useState<RuleCard[]>([])
  const [theoryDocuments, setTheoryDocuments] = useState<RuleTheoryDocument[]>([])
  const [folders, setFolders] = useState<RuleFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const db = await openDatabase()
      await ensureInitialGeneralFolder(db)
      const transaction = db.transaction([CARDS_STORE, FOLDERS_STORE, THEORY_STORE], "readonly")
      const cardsRequest = transaction.objectStore(CARDS_STORE).getAll()
      const foldersRequest = transaction.objectStore(FOLDERS_STORE).getAll()
      const theoryRequest = transaction.objectStore(THEORY_STORE).getAll()
      cardsRequest.onsuccess = () => {
        setAllCards((cardsRequest.result as RuleCard[]).sort((a, b) => b.createdAt - a.createdAt))
      }
      cardsRequest.onerror = () => setIsLoading(false)
      foldersRequest.onsuccess = () => setFolders((foldersRequest.result as RuleFolder[]).sort((a, b) => a.createdAt - b.createdAt))
      theoryRequest.onsuccess = () => {
        const documents = (theoryRequest.result as RuleTheoryDocument[]).map((item) => normalizeTheoryDocument(item))
        const loadedFolders = foldersRequest.result as RuleFolder[]
        setTheoryDocuments(documents.sort((a, b) => b.updatedAt - a.updatedAt))
        void recoverOrphanTheoryDocuments(documents, loadedFolders).then((recovered) => {
          if (!recovered) return
          const { recoveryFolder, recoveredIds } = recovered
          setFolders((items) => items.some((item) => item.id === recoveryFolder.id) ? items : [...items, recoveryFolder].sort((a, b) => a.createdAt - b.createdAt))
          setTheoryDocuments((items) => items.map((item) => recoveredIds.has(item.id) ? { ...item, folderId: recoveryFolder.id } : item))
          notifyUpdated()
        }).catch(() => undefined)
      }
      transaction.oncomplete = () => { db.close(); setIsLoading(false) }
      transaction.onerror = () => { db.close(); setIsLoading(false) }
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

  const addFolder = useCallback(async (name: string, kind: RuleFolder["kind"] = "cards") => {
    if (isSyncStudyOnly()) return null
    const now = Date.now()
    const folder: RuleFolder = { id: crypto.randomUUID(), name: name.trim(), kind, createdAt: now, updatedAt: now }
    if (!folder.name) return null
    try {
      await write(FOLDERS_STORE, (store) => store.add(folder))
      setFolders((current) => [...current, folder])
      notifyUpdated()
      return folder
    } catch { return null }
  }, [])

  const renameFolder = useCallback(async (id: string, name: string) => {
    if (isSyncStudyOnly()) return false
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

  const changeFolderKind = useCallback(async (id: string, kind: RuleFolder["kind"]) => {
    if (isSyncStudyOnly()) return false
    const current = folders.find((folder) => folder.id === id)
    if (!current || current.kind === kind) return Boolean(current)
    if (allCards.some((card) => card.folderId === id) || theoryDocuments.some((document) => document.folderId === id)) return false
    const updated = { ...current, kind, updatedAt: Date.now() }
    try {
      await write(FOLDERS_STORE, (store) => store.put(updated))
      setFolders((items) => items.map((item) => item.id === id ? updated : item))
      notifyUpdated()
      return true
    } catch { return false }
  }, [allCards, folders, theoryDocuments])

  const deleteFolder = useCallback(async (id: string) => {
    if (isSyncStudyOnly()) return false
    try {
      await write(FOLDERS_STORE, (store) => store.delete(id))
      setFolders((items) => items.filter((item) => item.id !== id))
      recordSyncTombstone("rule", FOLDERS_STORE, id)
      if (selectedFolderId === id) setSelectedFolderId(null)
      notifyUpdated()
      return true
    } catch { return false }
  }, [selectedFolderId])

  const addTheoryDocument = useCallback(async (folderId: string, title: string, blocks: RuleTheoryBlock[]) => {
    if (isSyncStudyOnly()) return null
    const folder = folders.find((item) => item.id === folderId)
    if (!folder || (folder.kind ?? "cards") !== "theory") return null
    const now = Date.now()
    const document = normalizeTheoryDocument({ id: crypto.randomUUID(), folderId, title, blocks, createdAt: now, updatedAt: now })
    try {
      await write(THEORY_STORE, (store) => store.add(document))
      setTheoryDocuments((items) => [document, ...items])
      notifyUpdated()
      return document
    } catch { return null }
  }, [folders])

  const updateTheoryDocument = useCallback(async (document: RuleTheoryDocument) => {
    if (isSyncStudyOnly()) return false
    const folder = folders.find((item) => item.id === document.folderId)
    if (!folder || (folder.kind ?? "cards") !== "theory") return false
    const normalized = normalizeTheoryDocument({ ...document, updatedAt: Date.now() })
    try {
      await write(THEORY_STORE, (store) => store.put(normalized))
      setTheoryDocuments((items) => items.map((item) => item.id === normalized.id ? normalized : item).sort((a, b) => b.updatedAt - a.updatedAt))
      notifyUpdated()
      return true
    } catch { return false }
  }, [folders])

  const deleteTheoryDocument = useCallback(async (id: string) => {
    if (isSyncStudyOnly()) return false
    try {
      await write(THEORY_STORE, (store) => store.delete(id))
      setTheoryDocuments((items) => items.filter((item) => item.id !== id))
      recordSyncTombstone("rule", THEORY_STORE, id)
      notifyUpdated()
      return true
    } catch { return false }
  }, [])

  const deleteTheoryDocumentsInFolder = useCallback(async (folderId: string) => {
    if (isSyncStudyOnly()) return false
    const ids = theoryDocuments.filter((document) => document.folderId === folderId).map((document) => document.id)
    if (!ids.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(THEORY_STORE, "readwrite")
        ids.forEach((id) => transaction.objectStore(THEORY_STORE).delete(id))
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
      })
      setTheoryDocuments((items) => items.filter((item) => !ids.includes(item.id)))
      ids.forEach((id) => recordSyncTombstone("rule", THEORY_STORE, id))
      notifyUpdated()
      return true
    } catch { return false }
  }, [theoryDocuments])

  const moveTheoryDocuments = useCallback(async (fromFolderId: string, toFolderId: string) => {
    if (isSyncStudyOnly()) return false
    const target = folders.find((item) => item.id === toFolderId)
    if (!target || (target.kind ?? "cards") !== "theory") return false
    const moving = theoryDocuments.filter((document) => document.folderId === fromFolderId).map((document) => ({ ...document, folderId: toFolderId, updatedAt: Date.now() }))
    if (!moving.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(THEORY_STORE, "readwrite")
        moving.forEach((document) => transaction.objectStore(THEORY_STORE).put(document))
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
      })
      setTheoryDocuments((items) => items.map((item) => moving.find((moved) => moved.id === item.id) ?? item))
      notifyUpdated()
      return true
    } catch { return false }
  }, [folders, theoryDocuments])

  const addCard = useCallback(async (front: string, back: string) => {
    if (isSyncStudyOnly()) return { ok: false, error: "This connection is study-only. Use the primary connection to create cards." }
    const cleanedFront = front.trim()
    const cleanedBack = back.trim()
    if (!selectedFolderId || !cleanedFront || !cleanedBack) return { ok: false, error: "Complete both sides of the card." }
    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId)
    if (selectedFolder?.kind === "theory") return { ok: false, error: "Theory folders accept theory notes, not rule cards." }
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
  }, [allCards, folders, selectedFolderId])

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
    if (isSyncStudyOnly()) return false
    try {
      await write(CARDS_STORE, (store) => store.delete(id))
      setAllCards((items) => items.filter((item) => item.id !== id))
      recordSyncTombstone("rule", CARDS_STORE, id)
      notifyUpdated()
      return true
    } catch { return false }
  }, [])

  const deleteCardsInFolder = useCallback(async (folderId: string) => {
    if (isSyncStudyOnly()) return false
    const ids = allCards.filter((card) => card.folderId === folderId).map((card) => card.id)
    if (!ids.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CARDS_STORE, "readwrite")
        ids.forEach((id) => transaction.objectStore(CARDS_STORE).delete(id))
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
      })
      setAllCards((items) => items.filter((card) => !ids.includes(card.id)))
      ids.forEach((id) => recordSyncTombstone("rule", CARDS_STORE, id))
      notifyUpdated()
      return true
    } catch { return false }
  }, [allCards])

  const moveCards = useCallback(async (fromFolderId: string, toFolderId: string) => {
    if (isSyncStudyOnly()) return false
    const target = folders.find((folder) => folder.id === toFolderId)
    if (!target || (target.kind ?? "cards") !== "cards") return false
    const moving = allCards.filter((card) => card.folderId === fromFolderId).map((card) => ({ ...card, folderId: toFolderId, updatedAt: Date.now() }))
    if (!moving.length) return true
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CARDS_STORE, "readwrite")
        moving.forEach((card) => transaction.objectStore(CARDS_STORE).put(card))
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
      })
      setAllCards((items) => items.map((card) => moving.find((item) => item.id === card.id) ?? card))
      notifyUpdated()
      return true
    } catch { return false }
  }, [allCards, folders])

  const addToReviewFolder = useCallback(async (id: string) => {
    const card = await readRuleCardById(id)
    return card && !card.isReviewFolder ? updateCard({ ...card, isReviewFolder: true }) : false
  }, [updateCard])

  const removeFromReviewFolder = useCallback(async (id: string) => {
    const card = await readRuleCardById(id)
    return card?.isReviewFolder ? updateCard({ ...card, isReviewFolder: false }) : false
  }, [updateCard])
  const recordStudyResult = useCallback(async (id: string, knewIt: boolean) => {
    const card = await readRuleCardById(id)
    return card ? updateCard({ ...card, studyStreak: knewIt ? (card.studyStreak ?? 0) + 1 : 0 }) : false
  }, [updateCard])

  const cards = selectedFolderId ? allCards.filter((card) => card.folderId === selectedFolderId) : allCards
  const reviewCards = allCards.filter((card) => card.isReviewFolder)
  const normalizedFolders = folders.map((folder) => ({ ...folder, kind: folder.kind ?? "cards" as const }))
  return { allCards, cards, reviewCards, theoryDocuments, folders: normalizedFolders, selectedFolderId, setSelectedFolderId, isLoading, addFolder, renameFolder, changeFolderKind, deleteFolder, addCard, updateCard, deleteCard, deleteCardsInFolder, moveCards, addTheoryDocument, updateTheoryDocument, deleteTheoryDocument, deleteTheoryDocumentsInFolder, moveTheoryDocuments, addToReviewFolder, removeFromReviewFolder, recordStudyResult }
}
