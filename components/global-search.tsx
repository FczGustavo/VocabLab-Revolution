"use client"

import { useEffect, useState } from "react"
import { Search, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type SearchResult = { lab: string; title: string; detail: string; href: string }

const SOURCES = [
  { db: "vocab-lab-db", store: "flashcards", lab: "VocabLab", href: "/" },
  { db: "regencylab-db", store: "cards", lab: "RegencyLab", href: "/regency" },
  { db: "rulelab-db", store: "cards", lab: "RuleLab", href: "/rules" },
  { db: "readlab-db", store: "texts", lab: "ReadLab", href: "/read" },
  { db: "vocab-lab-grammar-db", store: "grammarLists", lab: "QuestionLab", href: "/grammar" },
] as const

function readStore(databaseName: string, storeName: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName)
    request.onerror = () => resolve([])
    request.onupgradeneeded = () => request.transaction?.abort()
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.close()
        resolve([])
        return
      }
      const transaction = db.transaction(storeName, "readonly")
      const getAll = transaction.objectStore(storeName).getAll()
      getAll.onsuccess = () => {
        db.close()
        resolve(getAll.result as unknown[])
      }
      getAll.onerror = () => {
        db.close()
        resolve([])
      }
    }
  })
}

function searchableText(value: unknown) {
  if (!value || typeof value !== "object") return ""
  return Object.values(value as Record<string, unknown>)
    .filter((item) => typeof item === "string")
    .join(" ")
    .toLocaleLowerCase()
}

function resultTitle(value: Record<string, unknown>) {
  return String(value.word ?? value.term ?? value.title ?? value.front ?? value.pattern ?? value.name ?? "Registro")
}

function resultDetail(value: Record<string, unknown>) {
  return String(value.translation ?? value.meaningPt ?? value.back ?? value.definition ?? value.content ?? value.example ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 130)
}

async function searchAll(query: string): Promise<SearchResult[]> {
  const normalized = query.trim().toLocaleLowerCase()
  const groups = await Promise.all(SOURCES.map(async (source) => {
    const records = await readStore(source.db, source.store)
    return records
      .filter((value) => searchableText(value).includes(normalized))
      .slice(0, 12)
      .map((value) => {
        const record = value as Record<string, unknown>
        return { lab: source.lab, title: resultTitle(record), detail: resultDetail(record), href: source.href }
      })
  }))
  return groups.flat().slice(0, 40)
}

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || query.trim().length < 2) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setBusy(true)
      void searchAll(query).then((next) => {
        if (!cancelled) setResults(next)
      }).finally(() => {
        if (!cancelled) setBusy(false)
      })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        setQuery("")
        setResults([])
        setBusy(false)
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground/60 hover:text-foreground" aria-label="Buscar em todos os Labs" title="Buscar em todos os Labs">
          <Search className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Buscar em todos os Labs</DialogTitle>
          <DialogDescription>Procure palavras, traduções, regras, textos e listas salvas neste dispositivo.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={query} onChange={(event) => {
            const nextQuery = event.target.value
            setQuery(nextQuery)
            if (nextQuery.trim().length < 2) {
              setResults([])
              setBusy(false)
            }
          }} placeholder="Digite pelo menos 2 caracteres…" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2" />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {busy && <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />Buscando…</p>}
          {!busy && query.trim().length >= 2 && results.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nenhum registro encontrado.</p>}
          {results.map((result, index) => (
            <button key={`${result.lab}-${result.title}-${index}`} type="button" className="w-full rounded-lg border border-border/40 px-3 py-2 text-left transition-colors hover:bg-muted" onClick={() => { setOpen(false); router.push(result.href) }}>
              <p className="text-[10px] font-medium text-primary">{result.lab}</p>
              <p className="text-sm font-medium">{result.title}</p>
              {result.detail && <p className="truncate text-xs text-muted-foreground">{result.detail}</p>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
