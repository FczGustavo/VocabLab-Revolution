"use client"

import {
  FLASHCARDS_UPDATED_EVENT,
  READLAB_TEXTS_UPDATED_EVENT,
  REGENCYLAB_CARDS_UPDATED_EVENT,
  RULELAB_CARDS_UPDATED_EVENT,
} from "@/lib/constants"
import {
  SYNC_LAB_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION,
  SyncLabPayloadSchema,
  SyncSnapshotSchema,
  type SyncLabId,
  type SyncLabPayload,
  type SyncSnapshot,
} from "@/lib/sync-schema"

type IndexDefinition = {
  name: string
  keyPath: string | string[]
  unique?: boolean
}

type StoreDefinition = {
  name: string
  keyPath: string
  indexes?: IndexDefinition[]
}

type DatabaseDefinition = {
  name: string
  version: number
  stores: StoreDefinition[]
}

const DATABASES: DatabaseDefinition[] = [
  {
    name: "vocab-lab-db",
    version: 6,
    stores: [
      {
        name: "flashcards",
        keyPath: "id",
        indexes: [
          { name: "word", keyPath: "word" },
          { name: "word_pos", keyPath: ["word", "partOfSpeech"], unique: true },
          { name: "createdAt", keyPath: "createdAt" },
          { name: "folderId", keyPath: "folderId" },
          { name: "catalogId", keyPath: "catalogId" },
        ],
      },
      {
        name: "folders",
        keyPath: "id",
        indexes: [
          { name: "name", keyPath: "name", unique: true },
          { name: "createdAt", keyPath: "createdAt" },
        ],
      },
      { name: "catalogMeta", keyPath: "key" },
    ],
  },
  {
    name: "regencylab-db",
    version: 2,
    stores: [
      {
        name: "cards",
        keyPath: "id",
        indexes: [
          { name: "folderId", keyPath: "folderId" },
          { name: "createdAt", keyPath: "createdAt" },
          { name: "catalogId", keyPath: "catalogId" },
        ],
      },
      {
        name: "folders",
        keyPath: "id",
        indexes: [
          { name: "name", keyPath: "name", unique: true },
          { name: "createdAt", keyPath: "createdAt" },
        ],
      },
      { name: "catalogMeta", keyPath: "key" },
    ],
  },
  {
    name: "rulelab-db",
    version: 2,
    stores: [
      {
        name: "cards",
        keyPath: "id",
        indexes: [
          { name: "folderId", keyPath: "folderId" },
          { name: "createdAt", keyPath: "createdAt" },
        ],
      },
      {
        name: "folders",
        keyPath: "id",
        indexes: [{ name: "createdAt", keyPath: "createdAt" }],
      },
      { name: "meta", keyPath: "key" },
    ],
  },
  {
    name: "readlab-db",
    version: 1,
    stores: [
      {
        name: "texts",
        keyPath: "id",
        indexes: [
          { name: "folderId", keyPath: "folderId" },
          { name: "createdAt", keyPath: "createdAt" },
        ],
      },
      {
        name: "folders",
        keyPath: "id",
        indexes: [
          { name: "name", keyPath: "name", unique: true },
          { name: "createdAt", keyPath: "createdAt" },
        ],
      },
    ],
  },
  {
    name: "vocab-lab-grammar-db",
    version: 2,
    stores: [
      {
        name: "questions",
        keyPath: "id",
        indexes: [{ name: "topic", keyPath: "topic" }],
      },
      { name: "answered", keyPath: "questionId" },
      { name: "grammarFolders", keyPath: "id" },
      {
        name: "grammarLists",
        keyPath: "id",
        indexes: [{ name: "folderId", keyPath: "folderId" }],
      },
    ],
  },
]

const DATABASE_BY_LAB: Partial<Record<SyncLabId, DatabaseDefinition>> = {
  vocab: DATABASES[0],
  regency: DATABASES[1],
  rule: DATABASES[2],
  read: DATABASES[3],
  question: DATABASES[4],
}

export const SYNC_LABS: SyncLabId[] = [
  "general",
  "vocab",
  "regency",
  "rule",
  "read",
  "question",
]

const NEVER_SYNC_PREFIXES = [
  "vocablab_pron_",
  "readlab_audio_",
]

const NEVER_SYNC_KEYS = new Set([
  "openrouter-api-key",
  "vocablab_sync_code",
  "vocablab_sync_word",
  "vocablab_sync_pin",
  "vocablab_sync_revision",
  "vocablab_sync_revisions",
  "vocablab_sync_device_id",
  "vocablab_sync_status",
  "vocablab_sync_identity_locked",
  "vocablab_sync_owner_tokens",
])

const SYNCABLE_PREFIXES = [
  "vocab-lab-",
  "vocablab-",
  "vocablab_",
  "regency-lab-",
  "regencylab_",
  "read-lab-",
  "readlab_",
  "rule-lab-",
  "rulelab_",
  "grammar_",
  "grammarlab_",
]

const GENERAL_KEYS = new Set([
  "theme",
  "vocablab_color_palette",
  "vocablab_square_cards",
  "vocablab-card-shape",
  "vocablab_study_timer_enabled",
  "vocablab_study_shortcut_coach_enabled",
  "vocablab_study_header_collapsed",
  "vocablab_study_review_mistake_threshold",
  "vocab-lab-animations",
])

const LAB_PREFERENCE_MATCHERS: Record<SyncLabId, (key: string) => boolean> = {
  general: (key) => GENERAL_KEYS.has(key),
  vocab: (key) => (
    (key.startsWith("vocab-lab-") || key.startsWith("vocablab-") || key.startsWith("vocablab_"))
    && !GENERAL_KEYS.has(key)
  ),
  regency: (key) => key.startsWith("regency-lab-") || key.startsWith("regencylab_"),
  rule: (key) => key.startsWith("rule-lab-") || key.startsWith("rulelab_"),
  read: (key) => key.startsWith("read-lab-") || key.startsWith("readlab_"),
  question: (key) => key.startsWith("grammar_") || key.startsWith("grammarlab_"),
}

function openDatabase(definition: DatabaseDefinition): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(definition.name, definition.version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const definitionStore of definition.stores) {
        const store = db.objectStoreNames.contains(definitionStore.name)
          ? request.transaction!.objectStore(definitionStore.name)
          : db.createObjectStore(definitionStore.name, { keyPath: definitionStore.keyPath })

        for (const index of definitionStore.indexes ?? []) {
          if (!store.indexNames.contains(index.name)) {
            store.createIndex(index.name, index.keyPath, { unique: index.unique ?? false })
          }
        }
      }
    }
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(
      transaction.error ?? new Error("A transação local foi cancelada."),
    )
  })
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function stripLocalOnlyData(databaseName: string, storeName: string, value: unknown) {
  if (
    databaseName === "vocab-lab-db"
    && storeName === "flashcards"
    && value
    && typeof value === "object"
  ) {
    const { audioSrc: _audioSrc, ...syncable } = value as Record<string, unknown>
    return syncable
  }
  return value
}

async function exportDatabase(definition: DatabaseDefinition) {
  const db = await openDatabase(definition)
  try {
    const storeNames = definition.stores
      .map((store) => store.name)
      .filter((name) => db.objectStoreNames.contains(name))
    const transaction = db.transaction(storeNames, "readonly")
    const done = transactionDone(transaction)
    const entries = await Promise.all(storeNames.map(async (storeName) => {
      const values = await requestResult(transaction.objectStore(storeName).getAll())
      return [
        storeName,
        values.map((value) => stripLocalOnlyData(definition.name, storeName, value)),
      ] as const
    }))
    await done
    return Object.fromEntries(entries)
  } finally {
    db.close()
  }
}

async function replaceDatabase(
  definition: DatabaseDefinition,
  stores: Record<string, unknown[]>,
) {
  const db = await openDatabase(definition)
  try {
    const storeNames = definition.stores.map((store) => store.name)
    const transaction = db.transaction(storeNames, "readwrite")
    const done = transactionDone(transaction)

    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName)
      store.clear()
      for (const value of stores[storeName] ?? []) store.put(value)
    }

    await done
  } finally {
    db.close()
  }
}

function exportPreferences() {
  const preferences: Record<string, string> = {}
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key || NEVER_SYNC_KEYS.has(key)) continue
    if (NEVER_SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    if (!SYNCABLE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    const value = localStorage.getItem(key)
    if (value !== null) preferences[key] = value
  }
  return preferences
}

function exportLabPreferences(lab: SyncLabId) {
  const preferences: Record<string, string> = {}
  const matches = LAB_PREFERENCE_MATCHERS[lab]
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key || NEVER_SYNC_KEYS.has(key) || !matches(key)) continue
    if (NEVER_SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    const value = localStorage.getItem(key)
    if (value !== null) preferences[key] = value
  }
  return preferences
}

function importPreferences(preferences: Record<string, string>) {
  const existingKeys: string[] = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key || NEVER_SYNC_KEYS.has(key)) continue
    if (NEVER_SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    if (SYNCABLE_PREFIXES.some((prefix) => key.startsWith(prefix))) existingKeys.push(key)
  }
  for (const key of existingKeys) localStorage.removeItem(key)

  for (const [key, value] of Object.entries(preferences)) {
    if (NEVER_SYNC_KEYS.has(key)) continue
    if (NEVER_SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    if (!SYNCABLE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    localStorage.setItem(key, value)
  }
}

function importLabPreferences(lab: SyncLabId, preferences: Record<string, string>) {
  const matches = LAB_PREFERENCE_MATCHERS[lab]
  const existingKeys: string[] = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key || NEVER_SYNC_KEYS.has(key) || !matches(key)) continue
    if (!NEVER_SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))) existingKeys.push(key)
  }
  for (const key of existingKeys) localStorage.removeItem(key)
  for (const [key, value] of Object.entries(preferences)) {
    if (NEVER_SYNC_KEYS.has(key) || !matches(key)) continue
    if (NEVER_SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    localStorage.setItem(key, value)
  }
}

function dispatchLabUpdate(lab: SyncLabId) {
  const events: Partial<Record<SyncLabId, string>> = {
    vocab: FLASHCARDS_UPDATED_EVENT,
    regency: REGENCYLAB_CARDS_UPDATED_EVENT,
    rule: RULELAB_CARDS_UPDATED_EVENT,
    read: READLAB_TEXTS_UPDATED_EVENT,
  }
  const event = events[lab]
  if (event) window.dispatchEvent(new Event(event))
  window.dispatchEvent(new CustomEvent("vocablab-synced-preferences", { detail: { lab } }))
}

export async function exportLabData(lab: SyncLabId): Promise<SyncLabPayload> {
  const definition = DATABASE_BY_LAB[lab]
  return {
    version: SYNC_LAB_SCHEMA_VERSION,
    lab,
    exportedAt: Date.now(),
    stores: definition ? await exportDatabase(definition) : {},
    preferences: exportLabPreferences(lab),
  }
}

export async function importLabData(input: unknown) {
  const payload = SyncLabPayloadSchema.parse(input)
  const definition = DATABASE_BY_LAB[payload.lab]
  const backup = await exportLabData(payload.lab)
  try {
    if (definition) await replaceDatabase(definition, payload.stores)
    importLabPreferences(payload.lab, payload.preferences)
  } catch (error) {
    if (definition) await replaceDatabase(definition, backup.stores)
    importLabPreferences(payload.lab, backup.preferences)
    throw error
  }
  dispatchLabUpdate(payload.lab)
}

export async function exportAllAppData(): Promise<SyncSnapshot> {
  const databaseEntries = await Promise.all(DATABASES.map(async (definition) => [
    definition.name,
    await exportDatabase(definition),
  ] as const))

  return {
    version: SYNC_SCHEMA_VERSION,
    exportedAt: Date.now(),
    databases: Object.fromEntries(databaseEntries),
    preferences: exportPreferences(),
  }
}

export async function importAllAppData(input: unknown) {
  const snapshot = SyncSnapshotSchema.parse(input)
  const backup = await exportAllAppData()

  try {
    for (const definition of DATABASES) {
      await replaceDatabase(definition, snapshot.databases[definition.name] ?? {})
    }
    importPreferences(snapshot.preferences)
  } catch (error) {
    for (const definition of DATABASES) {
      await replaceDatabase(definition, backup.databases[definition.name] ?? {})
    }
    importPreferences(backup.preferences)
    throw error
  }

  window.dispatchEvent(new Event(FLASHCARDS_UPDATED_EVENT))
  window.dispatchEvent(new Event(REGENCYLAB_CARDS_UPDATED_EVENT))
  window.dispatchEvent(new Event(RULELAB_CARDS_UPDATED_EVENT))
  window.dispatchEvent(new Event(READLAB_TEXTS_UPDATED_EVENT))
}

export function summarizeSnapshot(snapshot: SyncSnapshot) {
  const counts = Object.fromEntries(DATABASES.map((database) => {
    const stores = snapshot.databases[database.name] ?? {}
    return [
      database.name,
      Object.values(stores).reduce((total, values) => total + values.length, 0),
    ]
  }))

  return {
    totalEntities: Object.values(counts).reduce((total, count) => total + count, 0),
    counts,
  }
}
