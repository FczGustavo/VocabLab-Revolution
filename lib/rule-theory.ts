import type { RuleTheoryBlock, RuleTheoryBlockType, RuleTheoryDocument, RuleTheoryTextRun } from "./types"

export const THEORY_BLOCK_TYPES: readonly RuleTheoryBlockType[] = [
  "title", "subtitle", "paragraph", "rule", "example", "exception", "tip", "bulleted-list", "numbered-list", "divider",
]

const MAX_BLOCKS = 80
const MAX_TEXT = 10_000
const MAX_TITLE = 240

export function makeTheoryRun(text = ""): RuleTheoryTextRun {
  return { text }
}

export function makeTheoryBlock(type: RuleTheoryBlockType = "paragraph"): RuleTheoryBlock {
  if (type === "divider") return { id: crypto.randomUUID(), type }
  if (type === "bulleted-list" || type === "numbered-list") return { id: crypto.randomUUID(), type, items: [[makeTheoryRun("")]] }
  return { id: crypto.randomUUID(), type, segments: [makeTheoryRun("")], fontFamily: "sans", fontSize: "normal", align: "left" }
}

function cleanText(value: unknown, max = MAX_TEXT) {
  return String(value ?? "").replace(/<[^>]*>/g, "").slice(0, max)
}

function normalizeRuns(runs: unknown): RuleTheoryTextRun[] {
  if (!Array.isArray(runs)) return [makeTheoryRun("")]
  const normalized = runs.slice(0, 40).map((run) => {
    const item = run && typeof run === "object" ? run as Record<string, unknown> : {}
    return {
      text: cleanText(item.text),
      ...(item.bold === true ? { bold: true } : {}),
      ...(item.italic === true ? { italic: true } : {}),
      ...(item.underline === true ? { underline: true } : {}),
      ...(typeof item.fontFamily === "string" && ["sans", "serif", "mono"].includes(item.fontFamily) ? { fontFamily: item.fontFamily as RuleTheoryTextRun["fontFamily"] } : {}),
      ...(typeof item.fontSize === "string" && ["small", "normal", "large"].includes(item.fontSize) ? { fontSize: item.fontSize as RuleTheoryTextRun["fontSize"] } : {}),
      ...(typeof item.color === "string" && ["default", "primary", "muted", "blue", "amber", "violet", "rose"].includes(item.color) ? { color: item.color as RuleTheoryTextRun["color"] } : {}),
      ...(typeof item.highlight === "string" && ["none", "yellow", "blue", "green", "rose"].includes(item.highlight) ? { highlight: item.highlight as RuleTheoryTextRun["highlight"] } : {}),
    }
  })
  return normalized.length ? normalized : [makeTheoryRun("")]
}

export function normalizeTheoryBlocks(value: unknown): RuleTheoryBlock[] {
  if (!Array.isArray(value)) return [makeTheoryBlock("paragraph")]
  return value.slice(0, MAX_BLOCKS).map((raw) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
    const type = THEORY_BLOCK_TYPES.includes(item.type as RuleTheoryBlockType) ? item.type as RuleTheoryBlockType : "paragraph"
    const block: RuleTheoryBlock = {
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      type,
      ...(typeof item.align === "string" && ["left", "center", "right"].includes(item.align) ? { align: item.align as RuleTheoryBlock["align"] } : {}),
      ...(typeof item.fontFamily === "string" && ["sans", "serif", "mono"].includes(item.fontFamily) ? { fontFamily: item.fontFamily as RuleTheoryBlock["fontFamily"] } : {}),
      ...(typeof item.fontSize === "string" && ["small", "normal", "large"].includes(item.fontSize) ? { fontSize: item.fontSize as RuleTheoryBlock["fontSize"] } : {}),
    }
    if (type === "divider") return block
    if (type === "bulleted-list" || type === "numbered-list") {
      const items = Array.isArray(item.items) ? item.items.slice(0, 30).map(normalizeRuns) : [[makeTheoryRun("")]]
      return { ...block, items: items.length ? items : [[makeTheoryRun("")]] }
    }
    return { ...block, segments: normalizeRuns(item.segments) }
  })
}

export function normalizeTheoryDocument(document: unknown): RuleTheoryDocument {
  const source = document && typeof document === "object" ? document as Partial<RuleTheoryDocument> : {}
  const now = Date.now()
  return {
    id: cleanText(source.id, 120).trim() || crypto.randomUUID(),
    folderId: cleanText(source.folderId, 120).trim(),
    title: cleanText(source.title, MAX_TITLE).trim() || "Untitled theory",
    blocks: normalizeTheoryBlocks(source.blocks),
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt as number : now,
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt as number : now,
  }
}

export function theoryBlockText(block: RuleTheoryBlock): string {
  if (block.type === "divider") return ""
  if (block.items) return block.items.map((item) => item.map((run) => run.text).join("")).join(" ")
  return (block.segments ?? []).map((run) => run.text).join("")
}

export function theoryDocumentPreview(document: RuleTheoryDocument): string {
  return document.blocks.map(theoryBlockText).filter(Boolean).join(" ").slice(0, 180)
}
