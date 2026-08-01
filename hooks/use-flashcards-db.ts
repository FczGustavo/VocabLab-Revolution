"use client"

import { useState, useEffect, useCallback } from "react"
import type { Flashcard, Folder } from "@/lib/types"
import { FLASHCARDS_UPDATED_EVENT } from "@/lib/constants"
import { recordSyncTombstone } from "@/lib/sync-tombstones"
import {
  VOCAB_DEFAULT_CATALOG,
  VOCAB_DEFAULT_CATALOG_VERSION,
  VOCAB_DEFAULT_FOLDER_COLOR,
  VOCAB_DEFAULT_FOLDER_NAME,
  validateVocabDefaultCatalog,
  vocabCatalogContentHash,
  vocabCatalogLegacyContentHash,
} from "@/lib/vocab-default-catalog"
import { VOCAB_IDIOMS_CATALOG, VOCAB_IDIOMS_CATALOG_VERSION, VOCAB_IDIOMS_FOLDER_COLOR, VOCAB_IDIOMS_FOLDER_NAME, validateVocabIdiomsCatalog, vocabIdiomsContentHash, vocabIdiomsLegacyContentHash } from "@/lib/vocab-idioms-catalog"

const DB_NAME = "vocab-lab-db"
const DB_VERSION = 6
const FLASHCARDS_STORE = "flashcards"
const FOLDERS_STORE = "folders"
const META_STORE = "catalogMeta"
const DEFAULT_CATALOG_META_KEY = "vocab-default-catalog"
const IDIOMS_CATALOG_META_KEY = "vocab-idioms-catalog"
const FOLDER_COLORS_UPDATED_EVENT = "vocablab-folder-colors-updated"

interface VocabCatalogMeta {
  key: string
  version: number
  folderId: string | null
  seenCatalogIds: string[]
}

function notifyFlashcardsUpdated() {
  if (typeof window === "undefined") return
  window.setTimeout(() => {
    window.dispatchEvent(new Event(FLASHCARDS_UPDATED_EVENT))
  }, 0)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      if (!db.objectStoreNames.contains(FLASHCARDS_STORE)) {
        const flashcardsStore = db.createObjectStore(FLASHCARDS_STORE, { keyPath: "id" })
        flashcardsStore.createIndex("word", "word", { unique: false })
        flashcardsStore.createIndex("word_pos", ["word", "partOfSpeech"], { unique: true })
        flashcardsStore.createIndex("createdAt", "createdAt", { unique: false })
        flashcardsStore.createIndex("folderId", "folderId", { unique: false })
        flashcardsStore.createIndex("catalogId", "catalogId", { unique: false })
      } else {
        const transaction = (event.target as IDBOpenDBRequest).transaction
        const flashcardsStore = transaction?.objectStore(FLASHCARDS_STORE)
        if (flashcardsStore) {
          if (!flashcardsStore.indexNames.contains("catalogId")) {
            flashcardsStore.createIndex("catalogId", "catalogId", { unique: false })
          }
          const seen = new Map<string, { id: string; createdAt: number }>()
          const cursorRequest = flashcardsStore.openCursor()

          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (cursor) {
              const value = cursor.value as any
              const word = String(value.word ?? "").toLowerCase()
              const pos = String(value.partOfSpeech ?? "")
              const createdAt = typeof value.createdAt === "number" ? value.createdAt : 0
              const key = `${word}__${pos}`
              const prev = seen.get(key)

              if (!prev) {
                seen.set(key, { id: value.id, createdAt })
              } else {
                if (createdAt > prev.createdAt) {
                  flashcardsStore.delete(prev.id)
                  seen.set(key, { id: value.id, createdAt })
                } else {
                  flashcardsStore.delete(value.id)
                }
              }

              cursor.continue()
              return
            }

            if (flashcardsStore.indexNames.contains("word_pos")) {
              flashcardsStore.deleteIndex("word_pos")
            }
            if (flashcardsStore.indexNames.contains("word")) {
              flashcardsStore.deleteIndex("word")
            }

            flashcardsStore.createIndex("word", "word", { unique: false })
            flashcardsStore.createIndex("word_pos", ["word", "partOfSpeech"], { unique: true })

            if (!flashcardsStore.indexNames.contains("createdAt")) {
              flashcardsStore.createIndex("createdAt", "createdAt", { unique: false })
            }
            if (!flashcardsStore.indexNames.contains("folderId")) {
              flashcardsStore.createIndex("folderId", "folderId", { unique: false })
            }
          }
        }
      }
      
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const foldersStore = db.createObjectStore(FOLDERS_STORE, { keyPath: "id" })
        foldersStore.createIndex("name", "name", { unique: true })
        foldersStore.createIndex("createdAt", "createdAt", { unique: false })
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

function applyDefaultFolderColor(folderId: string, color = VOCAB_DEFAULT_FOLDER_COLOR) {
  try {
    const key = "vocablab_folder_colors"
    const stored = localStorage.getItem(key)
    const colors = stored ? JSON.parse(stored) as Record<string, string> : {}
    if (!colors[folderId]) localStorage.setItem(key, JSON.stringify({ ...colors, [folderId]: color }))
    window.dispatchEvent(new Event(FOLDER_COLORS_UPDATED_EVENT))
  } catch {
    // A malformed visual preference must not invalidate the catalog transaction.
  }
}

function migrateIdiomsFolderColor(folderId: string) {
  try {
    const key = "vocablab_folder_colors"
    const stored = localStorage.getItem(key)
    const colors = stored ? JSON.parse(stored) as Record<string, string> : {}
    if (!colors[folderId] || colors[folderId] === "violet") {
      localStorage.setItem(key, JSON.stringify({ ...colors, [folderId]: VOCAB_IDIOMS_FOLDER_COLOR }))
      window.dispatchEvent(new Event(FOLDER_COLORS_UPDATED_EVENT))
    }
  } catch {
    // Preserve catalog installation even if a visual preference is malformed.
  }
}

async function ensureDefaultCatalog(db: IDBDatabase): Promise<void> {
  validateVocabDefaultCatalog()
  const transaction = db.transaction([FLASHCARDS_STORE, FOLDERS_STORE, META_STORE], "readwrite")
  const done = transactionComplete(transaction)
  const cardsStore = transaction.objectStore(FLASHCARDS_STORE)
  const foldersStore = transaction.objectStore(FOLDERS_STORE)
  const metaStore = transaction.objectStore(META_STORE)
  const [cards, folders, existingMeta] = await Promise.all([
    requestResult(cardsStore.getAll()) as Promise<Flashcard[]>,
    requestResult(foldersStore.getAll()) as Promise<Folder[]>,
    requestResult(metaStore.get(DEFAULT_CATALOG_META_KEY)) as Promise<VocabCatalogMeta | undefined>,
  ])

  const firstInstallation = !existingMeta
  let folderId = existingMeta?.folderId ?? null
  if (firstInstallation) {
    const existingFolder = folders.find((folder) => folder.name === VOCAB_DEFAULT_FOLDER_NAME)
    if (existingFolder) {
      folderId = existingFolder.id
    } else {
      const folder: Folder = { id: crypto.randomUUID(), name: VOCAB_DEFAULT_FOLDER_NAME, createdAt: Date.now() }
      foldersStore.add(folder)
      folders.push(folder)
      folderId = folder.id
    }
  }

  const destinationFolderId = folderId && folders.some((folder) => folder.id === folderId) ? folderId : null
  const seen = new Set(existingMeta?.seenCatalogIds ?? [])
  const cardsByCatalogId = new Map(cards.filter((card) => card.catalogId).map((card) => [card.catalogId as string, card]))
  const cardsByWordPos = new Map(cards.map((card) => [`${card.word.toLowerCase()}__${card.partOfSpeech}`, card]))
  const now = Date.now()

  VOCAB_DEFAULT_CATALOG.forEach((entry, index) => {
    const canonicalHash = vocabCatalogContentHash(entry)
    const current = cardsByCatalogId.get(entry.catalogId as string)
    if (current) {
      seen.add(entry.catalogId as string)
      const isUntouched = Boolean(current.catalogContentHash) && (
        vocabCatalogContentHash(current) === current.catalogContentHash
        || (current.catalogRevision === 1 && vocabCatalogLegacyContentHash(current) === current.catalogContentHash)
      )
      const mustNormalizePhrasalShape = current.partOfSpeech !== "phrasal-verb" || current.alternativeForms.length > 0
      const mustRemoveCatalogContext = Boolean(current.usageNote || current.usageNoteEn)
      if (mustNormalizePhrasalShape || mustRemoveCatalogContext || (isUntouched && (current.catalogContentHash !== canonicalHash || current.catalogRevision !== entry.catalogRevision))) {
        cardsStore.put({
          ...current,
          ...(isUntouched ? entry : {}),
          partOfSpeech: "phrasal-verb",
          alternativeForms: [],
          usageNote: "",
          usageNoteEn: "",
          catalogRevision: entry.catalogRevision,
          ...(isUntouched ? { catalogContentHash: canonicalHash } : {}),
        })
      }
      return
    }
    if (seen.has(entry.catalogId as string)) return

    const wordKey = `${entry.word.toLowerCase()}__${entry.partOfSpeech}`
    if (cardsByWordPos.has(wordKey)) {
      // A personal card always wins; remember the candidate so it is not retried on every load.
      seen.add(entry.catalogId as string)
      return
    }
    const card: Flashcard = {
      ...entry,
      id: crypto.randomUUID(),
      catalogContentHash: canonicalHash,
      folderId: destinationFolderId,
      createdAt: now - index,
    }
    cardsStore.add(card)
    cardsByWordPos.set(wordKey, card)
    seen.add(entry.catalogId as string)
  })

  metaStore.put({
    key: DEFAULT_CATALOG_META_KEY,
    version: VOCAB_DEFAULT_CATALOG_VERSION,
    folderId,
    seenCatalogIds: [...seen],
  } satisfies VocabCatalogMeta)
  await done
  if (firstInstallation && folderId) applyDefaultFolderColor(folderId)
}

async function ensureIdiomsCatalog(db: IDBDatabase): Promise<void> {
  validateVocabIdiomsCatalog()
  const transaction = db.transaction([FLASHCARDS_STORE, FOLDERS_STORE, META_STORE], "readwrite")
  const done = transactionComplete(transaction)
  const cardsStore = transaction.objectStore(FLASHCARDS_STORE)
  const foldersStore = transaction.objectStore(FOLDERS_STORE)
  const metaStore = transaction.objectStore(META_STORE)
  const [cards, folders, existingMeta] = await Promise.all([
    requestResult(cardsStore.getAll()) as Promise<Flashcard[]>,
    requestResult(foldersStore.getAll()) as Promise<Folder[]>,
    requestResult(metaStore.get(IDIOMS_CATALOG_META_KEY)) as Promise<VocabCatalogMeta | undefined>,
  ])

  const firstInstallation = !existingMeta
  const needsIdentityMigration = Boolean(existingMeta && existingMeta.version < 3)
  let folderId = existingMeta?.folderId ?? null
  if (firstInstallation) {
    const existingFolder = folders.find((folder) => folder.name === VOCAB_IDIOMS_FOLDER_NAME)
    if (existingFolder) folderId = existingFolder.id
    else {
      const folder: Folder = { id: crypto.randomUUID(), name: VOCAB_IDIOMS_FOLDER_NAME, createdAt: Date.now() }
      foldersStore.add(folder)
      folders.push(folder)
      folderId = folder.id
    }
  }

  if (!firstInstallation && folderId) {
    const catalogFolder = folders.find((folder) => folder.id === folderId)
    const nameAlreadyUsed = folders.some((folder) => folder.id !== folderId && folder.name === VOCAB_IDIOMS_FOLDER_NAME)
    if (catalogFolder?.name === "Idiomatic Expressions Essentials" && !nameAlreadyUsed) {
      const renamed = { ...catalogFolder, name: VOCAB_IDIOMS_FOLDER_NAME }
      foldersStore.put(renamed)
      const index = folders.findIndex((folder) => folder.id === folderId)
      if (index >= 0) folders[index] = renamed
    }
  }

  const destinationFolderId = folderId && folders.some((folder) => folder.id === folderId) ? folderId : null
  const seen = new Set(existingMeta?.seenCatalogIds ?? [])
  const cardsByCatalogId = new Map(cards.filter((card) => card.catalogId).map((card) => [card.catalogId as string, card]))
  const cardsByWordPos = new Map(cards.map((card) => [`${card.word.toLowerCase()}__${card.partOfSpeech}`, card]))
  const now = Date.now()

  VOCAB_IDIOMS_CATALOG.forEach((entry, index) => {
    const canonicalHash = vocabIdiomsContentHash(entry)
    const current = cardsByCatalogId.get(entry.catalogId as string)
    if (current) {
      seen.add(entry.catalogId as string)
      const isUntouched = Boolean(current.catalogContentHash) && (vocabIdiomsContentHash(current) === current.catalogContentHash || vocabIdiomsLegacyContentHash(current) === current.catalogContentHash)
      if (isUntouched && (current.catalogContentHash !== canonicalHash || current.catalogRevision !== entry.catalogRevision)) {
        cardsStore.put({ ...current, ...entry, catalogContentHash: canonicalHash })
      }
      return
    }
    if (seen.has(entry.catalogId as string)) return
    const wordKey = `${entry.word.toLowerCase()}__${entry.partOfSpeech}`
    if (cardsByWordPos.has(wordKey)) { seen.add(entry.catalogId as string); return }
    const card: Flashcard = { ...entry, id: crypto.randomUUID(), catalogContentHash: canonicalHash, folderId: destinationFolderId, createdAt: now - index }
    cardsStore.add(card)
    cardsByWordPos.set(wordKey, card)
    seen.add(entry.catalogId as string)
  })

  metaStore.put({ key: IDIOMS_CATALOG_META_KEY, version: VOCAB_IDIOMS_CATALOG_VERSION, folderId, seenCatalogIds: [...seen] } satisfies VocabCatalogMeta)
  await done
  if (firstInstallation && folderId) applyDefaultFolderColor(folderId, VOCAB_IDIOMS_FOLDER_COLOR)
  else if (needsIdentityMigration && folderId) migrateIdiomsFolderColor(folderId)
}

export async function readAllFlashcardsFromDB(): Promise<Flashcard[]> {
  const db = await openDatabase()
  return new Promise((resolve) => {
    const tx = db.transaction(FLASHCARDS_STORE, "readonly")
    const store = tx.objectStore(FLASHCARDS_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as Flashcard[])
    req.onerror = () => resolve([])
  })
}

export async function readAllFoldersFromDB(): Promise<Folder[]> {
  const db = await openDatabase()
  return new Promise((resolve) => {
    const tx = db.transaction(FOLDERS_STORE, "readonly")
    const store = tx.objectStore(FOLDERS_STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      const folders = (req.result as Folder[]) || []
      folders.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      resolve(folders)
    }
    req.onerror = () => resolve([])
  })
}

export function useFlashcardsDB() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const db = await openDatabase()
      await ensureDefaultCatalog(db)
      await ensureIdiomsCatalog(db)
      
      // Load folders
      const foldersTransaction = db.transaction(FOLDERS_STORE, "readonly")
      const foldersStore = foldersTransaction.objectStore(FOLDERS_STORE)
      const foldersRequest = foldersStore.getAll()

      foldersRequest.onsuccess = () => {
        const loadedFolders = foldersRequest.result as Folder[]
        loadedFolders.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        setFolders(loadedFolders)
      }

      // Load flashcards
      const flashcardsTransaction = db.transaction(FLASHCARDS_STORE, "readonly")
      const flashcardsStore = flashcardsTransaction.objectStore(FLASHCARDS_STORE)
      const flashcardsRequest = flashcardsStore.getAll()

      flashcardsRequest.onsuccess = () => {
        const cards = flashcardsRequest.result as Flashcard[]
        cards.sort((a, b) => b.createdAt - a.createdAt)
        setFlashcards(cards)
        setIsLoading(false)
      }

      flashcardsRequest.onerror = () => {
        console.error("Error loading flashcards:", flashcardsRequest.error)
        setIsLoading(false)
      }
    } catch (error) {
      console.error("Error opening database:", error)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const onUpdated = () => loadData()
    window.addEventListener(FLASHCARDS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(FLASHCARDS_UPDATED_EVENT, onUpdated)
  }, [loadData])

  // Folder operations
  const addFolder = useCallback(async (name: string): Promise<Folder | null> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FOLDERS_STORE, "readwrite")
      const store = transaction.objectStore(FOLDERS_STORE)

      const folder: Folder = {
        id: crypto.randomUUID(),
        name: name.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      return new Promise((resolve) => {
        const request = store.add(folder)

        request.onsuccess = () => {
          setFolders((prev) => [...prev, folder].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
          notifyFlashcardsUpdated()
          resolve(folder)
        }

        request.onerror = () => {
          console.error("Error adding folder:", request.error)
          resolve(null)
        }
      })
    } catch (error) {
      console.error("Error adding folder:", error)
      return null
    }
  }, [])

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction([FLASHCARDS_STORE, FOLDERS_STORE], "readwrite")
      const flashcardsStore = transaction.objectStore(FLASHCARDS_STORE)
      const foldersStore = transaction.objectStore(FOLDERS_STORE)
      // Read IndexedDB rather than React state: a transfer can have completed
      // in the database while the component still holds the previous list.
      const cardsInFolder = await new Promise<Flashcard[]>((resolve, reject) => {
        const request = flashcardsStore.index("folderId").getAll(id)
        request.onsuccess = () => resolve(request.result as Flashcard[])
        request.onerror = () => reject(request.error)
      })
      // Folder deletion must never silently move cards to the virtual General
      // folder. Callers explicitly transfer or delete cards first.
      if (cardsInFolder.length > 0) {
        return false
      }
      foldersStore.delete(id)
      await transactionComplete(transaction)
      recordSyncTombstone("vocab", FOLDERS_STORE, id)
      setFolders((prev) => prev.filter((f) => f.id !== id))
      if (selectedFolderId === id) setSelectedFolderId(null)
      notifyFlashcardsUpdated()
      return true
    } catch (error) {
      console.error("Error deleting folder:", error)
      return false
    }
  }, [selectedFolderId])

  const renameFolder = useCallback(async (id: string, newName: string): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FOLDERS_STORE, "readwrite")
      const store = transaction.objectStore(FOLDERS_STORE)

      return new Promise((resolve) => {
        const getRequest = store.get(id)
        
        getRequest.onsuccess = () => {
          const folder = getRequest.result
          if (!folder) {
            resolve(false)
            return
          }

          const updatedFolder = { ...folder, name: newName.trim(), updatedAt: Date.now() }
          const putRequest = store.put(updatedFolder)

          putRequest.onsuccess = () => {
            setFolders((prev) => prev.map(f => f.id === id ? updatedFolder : f).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
            notifyFlashcardsUpdated()
            resolve(true)
          }

          putRequest.onerror = () => {
            console.error("Error renaming folder:", putRequest.error)
            resolve(false)
          }
        }

        getRequest.onerror = () => {
          console.error("Error getting folder:", getRequest.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.error("Error renaming folder:", error)
      return false
    }
  }, [])

  // Flashcard operations
  const addFlashcard = useCallback(
    async (flashcard: Flashcard, explicitFolderId?: string | null): Promise<boolean> => {
      try {
        const db = await openDatabase()
        const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
        const store = transaction.objectStore(FLASHCARDS_STORE)

        const normalizedWord = String(flashcard.word ?? "").trim().toLowerCase()

        // An explicit folder (even null = "General") wins over the hook's
        // selectedFolderId. Callers that don't pass anything fall back to the
        // hook state, preserving the existing VocabLab behavior.
        const resolvedFolderId =
          explicitFolderId !== undefined ? explicitFolderId : selectedFolderId

        const flashcardWithFolder = {
          ...flashcard,
          word: normalizedWord,
          folderId: resolvedFolderId,
          updatedAt: Date.now(),
        }

        return new Promise((resolve) => {
          const index = store.index("word_pos")
          const checkRequest = index.get([flashcardWithFolder.word, flashcardWithFolder.partOfSpeech])

          checkRequest.onsuccess = () => {
            if (checkRequest.result) {
              resolve(false)
              return
            }

            const request = store.add(flashcardWithFolder)

            request.onsuccess = () => {
              setFlashcards((prev) => [flashcardWithFolder, ...prev])
              notifyFlashcardsUpdated()
              resolve(true)
            }

            request.onerror = () => {
              resolve(false)
            }
          }

          checkRequest.onerror = () => resolve(false)
        })
      } catch (error) {
        console.error("Error adding flashcard:", error)
        return false
      }
    },
    [selectedFolderId]
  )

  const deleteFlashcard = useCallback(async (id: string): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
      const store = transaction.objectStore(FLASHCARDS_STORE)

      store.delete(id)
      await transactionComplete(transaction)
      recordSyncTombstone("vocab", FLASHCARDS_STORE, id)
      setFlashcards((prev) => prev.filter((card) => card.id !== id))
      notifyFlashcardsUpdated()
      return true
    } catch (error) {
      console.error("Error deleting flashcard:", error)
      return false
    }
  }, [])

  const updateFlashcard = useCallback(async (flashcard: Flashcard): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
      const store = transaction.objectStore(FLASHCARDS_STORE)

      return new Promise((resolve) => {
        const getById = store.get(flashcard.id)

        getById.onsuccess = () => {
          const existingById = getById.result as Flashcard | undefined
          const normalizedWord = String(flashcard.word ?? "").trim().toLowerCase()

          const merged: Flashcard = {
            ...flashcard,
            word: normalizedWord,
            // `null` is a deliberate request for the virtual General folder;
            // do not reinterpret it as an old folder assignment.
            folderId: flashcard.folderId,
            updatedAt: Date.now(),
          }

          const index = store.index("word_pos")
          const key = [merged.word, merged.partOfSpeech]
          const checkRequest = index.get(key)

          checkRequest.onsuccess = () => {
            const existing = checkRequest.result as Flashcard | undefined
            if (existing && existing.id !== merged.id) {
              resolve(false)
              return
            }

            const request = store.put(merged)

            request.onsuccess = () => {
              setFlashcards((prev) => prev.map((c) => (c.id === merged.id ? merged : c)))
              notifyFlashcardsUpdated()
              resolve(true)
            }

            request.onerror = () => resolve(false)
          }

          checkRequest.onerror = () => resolve(false)
        }

        getById.onerror = () => resolve(false)
      })
    } catch {
      return false
    }
  }, [])

  const moveFlashcardToFolder = useCallback(async (flashcardId: string, folderId: string | null): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
      const store = transaction.objectStore(FLASHCARDS_STORE)

      const flashcard = flashcards.find(f => f.id === flashcardId)
      if (!flashcard) return false

      const updatedFlashcard = { ...flashcard, folderId, updatedAt: Date.now() }

      return new Promise((resolve) => {
        const request = store.put(updatedFlashcard)

        request.onsuccess = () => {
          setFlashcards((prev) => prev.map(card => 
            card.id === flashcardId ? updatedFlashcard : card
          ))
          notifyFlashcardsUpdated()
          resolve(true)
        }

        request.onerror = () => {
          console.error("Error moving flashcard:", request.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.error("Error moving flashcard:", error)
      return false
    }
  }, [flashcards])

  const getRandomFlashcards = useCallback(
    (count: number): Flashcard[] => {
      const shuffled = [...flashcards].sort(() => Math.random() - 0.5)
      return shuffled.slice(0, Math.min(count, shuffled.length))
    },
    [flashcards]
  )

  const importAllData = useCallback(async (data: { flashcards: Flashcard[]; folders: Folder[] }): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const tx = db.transaction([FLASHCARDS_STORE, FOLDERS_STORE], "readwrite")
      const flashcardsStore = tx.objectStore(FLASHCARDS_STORE)
      const foldersStore = tx.objectStore(FOLDERS_STORE)

      const safeFolders = (data.folders || [])
        .filter((f) => f && typeof f.id === "string" && typeof f.name === "string")
        .map((f) => ({
          id: f.id,
          name: f.name,
          createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now(),
          updatedAt: typeof f.updatedAt === "number" ? f.updatedAt : undefined,
        }))

      const folderIds = new Set(safeFolders.map((f) => f.id))

      const dedup = new Map<string, Flashcard>()
      for (const card of data.flashcards || []) {
        if (!card || typeof card.id !== "string") continue
        const word = String(card.word ?? "").toLowerCase()
        const pos = String(card.partOfSpeech ?? "")
        if (!word || !pos) continue

        const createdAt = typeof card.createdAt === "number" ? card.createdAt : Date.now()
        const folderId = card.folderId && folderIds.has(card.folderId) ? card.folderId : null
        const key = `${word}__${pos}`

        const normalized: Flashcard = {
          ...card,
          word,
          folderId,
          createdAt,
        }

        const prev = dedup.get(key)
        if (!prev || (prev.createdAt ?? 0) < createdAt) {
          dedup.set(key, normalized)
        }
      }

      const safeCards = Array.from(dedup.values())

      return await new Promise<boolean>((resolve) => {
        const clearFolders = foldersStore.clear()
        clearFolders.onerror = () => resolve(false)
        clearFolders.onsuccess = () => {
          const clearCards = flashcardsStore.clear()
          clearCards.onerror = () => resolve(false)
          clearCards.onsuccess = () => {
            for (const f of safeFolders) {
              foldersStore.put(f)
            }
            for (const c of safeCards) {
              flashcardsStore.put(c)
            }
          }
        }

        tx.oncomplete = () => {
          safeFolders.sort((a, b) => a.name.localeCompare(b.name))
          safeCards.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          setFolders(safeFolders.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
          setFlashcards(safeCards)
          setSelectedFolderId(null)
          notifyFlashcardsUpdated()
          resolve(true)
        }
        tx.onerror = () => resolve(false)
        tx.onabort = () => resolve(false)
      })
    } catch {
      return false
    }
  }, [])

  const addToReviewFolder = useCallback(
    async (id: string): Promise<boolean> => {
      const card = flashcards.find((f) => f.id === id)
      if (!card || card.isReviewFolder) return false
      return updateFlashcard({ ...card, isReviewFolder: true })
    },
    [flashcards, updateFlashcard]
  )

  const removeFromReviewFolder = useCallback(
    async (id: string): Promise<boolean> => {
      const card = flashcards.find((f) => f.id === id)
      if (!card) return false
      return updateFlashcard({ ...card, isReviewFolder: false })
    },
    [flashcards, updateFlashcard]
  )

  const recordStudyResult = useCallback(
    async (id: string, knewIt: boolean): Promise<boolean> => {
      const card = flashcards.find((item) => item.id === id)
      if (!card) return false
      return updateFlashcard({ ...card, studyStreak: knewIt ? (card.studyStreak ?? 0) + 1 : 0 })
    },
    [flashcards, updateFlashcard],
  )

  const reviewFlashcards = flashcards.filter((f) => f.isReviewFolder === true)

  const filteredFlashcards = selectedFolderId
    ? flashcards.filter(f => f.folderId === selectedFolderId)
    : flashcards

  return {
    flashcards: filteredFlashcards,
    allFlashcards: flashcards,
    reviewFlashcards,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    isLoading,
    addFlashcard,
    deleteFlashcard,
    updateFlashcard,
    moveFlashcardToFolder,
    addFolder,
    deleteFolder,
    renameFolder,
    addToReviewFolder,
    removeFromReviewFolder,
    recordStudyResult,
    getRandomFlashcards,
    importAllData,
    refresh: loadData,
  }
}
