"use client"

import { useState, useEffect, useCallback } from "react"
import type { ReadLabText, ReadLabFolder } from "@/lib/types"
import { READLAB_TEXTS_UPDATED_EVENT } from "@/lib/constants"
import { recordSyncTombstone } from "@/lib/sync-tombstones"

const DB_NAME = "readlab-db"
const DB_VERSION = 1
const TEXTS_STORE = "texts"
const FOLDERS_STORE = "folders"

function notifyReadlabUpdated() {
  if (typeof window === "undefined") return
  window.setTimeout(() => {
    window.dispatchEvent(new Event(READLAB_TEXTS_UPDATED_EVENT))
  }, 0)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(TEXTS_STORE)) {
        const textsStore = db.createObjectStore(TEXTS_STORE, { keyPath: "id" })
        textsStore.createIndex("folderId", "folderId", { unique: false })
        textsStore.createIndex("createdAt", "createdAt", { unique: false })
      }

      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const foldersStore = db.createObjectStore(FOLDERS_STORE, { keyPath: "id" })
        foldersStore.createIndex("name", "name", { unique: true })
        foldersStore.createIndex("createdAt", "createdAt", { unique: false })
      }
    }
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function readAllTextsFromDB(): Promise<ReadLabText[]> {
  const db = await openDatabase()
  return new Promise((resolve) => {
    const tx = db.transaction(TEXTS_STORE, "readonly")
    const store = tx.objectStore(TEXTS_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as ReadLabText[])
    req.onerror = () => resolve([])
  })
}

export function useReadlabDB() {
  const [texts, setTexts] = useState<ReadLabText[]>([])
  const [folders, setFolders] = useState<ReadLabFolder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const db = await openDatabase()

      const foldersTransaction = db.transaction(FOLDERS_STORE, "readonly")
      const foldersStore = foldersTransaction.objectStore(FOLDERS_STORE)
      const foldersRequest = foldersStore.getAll()

      foldersRequest.onsuccess = () => {
        const loadedFolders = foldersRequest.result as ReadLabFolder[]
        loadedFolders.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        setFolders(loadedFolders)
      }

      const textsTransaction = db.transaction(TEXTS_STORE, "readonly")
      const textsStore = textsTransaction.objectStore(TEXTS_STORE)
      const textsRequest = textsStore.getAll()

      textsRequest.onsuccess = () => {
        const loadedTexts = textsRequest.result as ReadLabText[]
        loadedTexts.sort((a, b) => a.createdAt - b.createdAt)
        setTexts(loadedTexts)
        setIsLoading(false)
      }

      textsRequest.onerror = () => {
        console.error("Error loading texts:", textsRequest.error)
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
    window.addEventListener(READLAB_TEXTS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(READLAB_TEXTS_UPDATED_EVENT, onUpdated)
  }, [loadData])

  const addFolder = useCallback(async (name: string): Promise<ReadLabFolder | null> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FOLDERS_STORE, "readwrite")
      const store = transaction.objectStore(FOLDERS_STORE)

      const now = Date.now()
      const folder: ReadLabFolder = {
        id: crypto.randomUUID(),
        name: name.trim(),
        createdAt: now,
        updatedAt: now,
      }

      return new Promise((resolve) => {
        const request = store.add(folder)
        request.onsuccess = () => {
          setFolders((prev) => [...prev, folder].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
          notifyReadlabUpdated()
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
      const foldersTransaction = db.transaction(FOLDERS_STORE, "readwrite")
      const foldersStore = foldersTransaction.objectStore(FOLDERS_STORE)

      foldersStore.delete(id)
      await transactionComplete(foldersTransaction)
      recordSyncTombstone("read", FOLDERS_STORE, id)
      setFolders((prev) => prev.filter((f) => f.id !== id))
      if (selectedFolderId === id) setSelectedFolderId(null)
      notifyReadlabUpdated()
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
          if (!folder) { resolve(false); return }
          const updatedFolder = { ...folder, name: newName.trim(), updatedAt: Date.now() }
          const putRequest = store.put(updatedFolder)
          putRequest.onsuccess = () => {
            setFolders((prev) => prev.map((f) => (f.id === id ? updatedFolder : f)).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)))
            notifyReadlabUpdated()
            resolve(true)
          }
          putRequest.onerror = () => resolve(false)
        }
        getRequest.onerror = () => resolve(false)
      })
    } catch (error) {
      console.error("Error renaming folder:", error)
      return false
    }
  }, [])

  const addText = useCallback(
    async (text: ReadLabText): Promise<boolean> => {
      try {
        const db = await openDatabase()
        const transaction = db.transaction(TEXTS_STORE, "readwrite")
        const store = transaction.objectStore(TEXTS_STORE)

        const textWithFolder = {
          ...text,
          updatedAt: text.updatedAt ?? Date.now(),
          folderId: selectedFolderId === "__general__" ? null : selectedFolderId,
        }

        return new Promise((resolve) => {
          const request = store.add(textWithFolder)
          request.onsuccess = () => {
            setTexts((prev) => [...prev, textWithFolder].sort((a, b) => a.createdAt - b.createdAt))
            notifyReadlabUpdated()
            resolve(true)
          }
          request.onerror = () => resolve(false)
        })
      } catch (error) {
        console.error("Error adding text:", error)
        return false
      }
    },
    [selectedFolderId]
  )

  const updateText = useCallback(async (text: ReadLabText): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(TEXTS_STORE, "readwrite")
      const store = transaction.objectStore(TEXTS_STORE)

      return new Promise((resolve) => {
        const updatedText = { ...text, updatedAt: Date.now() }
        const request = store.put(updatedText)
        request.onsuccess = () => {
          setTexts((prev) => prev.map((t) => (t.id === text.id ? updatedText : t)))
          notifyReadlabUpdated()
          resolve(true)
        }
        request.onerror = () => resolve(false)
      })
    } catch (error) {
      console.error("Error updating text:", error)
      return false
    }
  }, [])

  const deleteText = useCallback(async (id: string): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(TEXTS_STORE, "readwrite")
      const store = transaction.objectStore(TEXTS_STORE)

      store.delete(id)
      await transactionComplete(transaction)
      recordSyncTombstone("read", TEXTS_STORE, id)
      setTexts((prev) => prev.filter((t) => t.id !== id))
      notifyReadlabUpdated()
      return true
    } catch (error) {
      console.error("Error deleting text:", error)
      return false
    }
  }, [])

  const filteredTexts = selectedFolderId
    ? texts.filter((t) => selectedFolderId === "__general__" ? !t.folderId : t.folderId === selectedFolderId)
    : texts

  return {
    texts: filteredTexts,
    allTexts: texts,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    isLoading,
    addText,
    updateText,
    deleteText,
    addFolder,
    deleteFolder,
    renameFolder,
    refresh: loadData,
  }
}
