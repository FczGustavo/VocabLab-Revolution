"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Bold, ChevronDown, ChevronUp, Copy, CopyPlus, GripVertical, Italic, Pencil, Plus, Save, Search, Trash2, Underline } from "lucide-react"
import type { RuleTheoryBlock, RuleTheoryBlockType, RuleTheoryDocument, RuleTheoryTextRun } from "@/lib/types"
import { makeTheoryBlock, normalizeTheoryBlocks, theoryBlockText, theoryDocumentPreview } from "@/lib/rule-theory"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const blockLabels: Record<RuleTheoryBlockType, string> = {
  title: "Title", subtitle: "Subtitle", paragraph: "Paragraph", rule: "Rule", example: "Example", exception: "Exception", tip: "Tip",
  "bulleted-list": "Bulleted list", "numbered-list": "Numbered list", divider: "Divider",
}
const fontClasses = { sans: "font-sans", serif: "font-serif", mono: "font-mono" }
const sizeClasses = { small: "text-sm", normal: "text-base", large: "text-xl" }
const fontValues = { sans: "Arial, sans-serif", serif: "Georgia, serif", mono: "ui-monospace, SFMono-Regular, Menlo, monospace" }
const sizeValues = { small: "0.875rem", normal: "1rem", large: "1.25rem" }
const alignClasses = { left: "text-left", center: "text-center", right: "text-right" }
const colorClasses = { default: "text-foreground", primary: "text-primary", muted: "text-muted-foreground", blue: "text-blue-600 dark:text-blue-300", amber: "text-amber-700 dark:text-amber-300", violet: "text-violet-700 dark:text-violet-300", rose: "text-rose-700 dark:text-rose-300" }
const colorValues = { default: "", primary: "hsl(var(--primary))", muted: "hsl(var(--muted-foreground))", blue: "#60a5fa", amber: "#fbbf24", violet: "#c084fc", rose: "#fb7185" }
const highlightClasses = { none: "", yellow: "bg-yellow-300/30", blue: "bg-blue-300/30", green: "bg-emerald-300/30", rose: "bg-rose-300/30" }
const highlightValues = { none: "", yellow: "#fde04766", blue: "#93c5fd66", green: "#86efac66", rose: "#fda4af66" }

const textOfRuns = (runs?: RuleTheoryTextRun[]) => (runs ?? []).map((run) => run.text).join("")
const cloneBlocks = (blocks: RuleTheoryBlock[]) => normalizeTheoryBlocks(blocks).map((block) => ({ ...block, id: crypto.randomUUID(), segments: block.segments?.map((run) => ({ ...run })), items: block.items?.map((item) => item.map((run) => ({ ...run }))) }))
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br />")

function runsToHtml(runs?: RuleTheoryTextRun[]) {
  return (runs ?? []).map((run) => {
    const styles = [run.bold && "font-weight:700", run.italic && "font-style:italic", run.underline && "text-decoration:underline", run.fontFamily && `font-family:${fontValues[run.fontFamily]}`, run.fontSize && `font-size:${sizeValues[run.fontSize]}`, run.color && colorValues[run.color] && `color:${colorValues[run.color]}`, run.highlight && highlightValues[run.highlight] && `background-color:${highlightValues[run.highlight]}`].filter(Boolean).join(";")
    return `<span${styles ? ` style=\"${styles}\"` : ""}>${escapeHtml(run.text)}</span>`
  }).join("") || "<span><br /></span>"
}

function colorKey(value: string) {
  const normalized = value.replace(/\s/g, "").toLowerCase()
  const hex = normalized.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/)
  if (hex) {
    const raw = hex[1]
    const alpha = raw.length === 8 ? Number.parseInt(raw.slice(6), 16) / 255 : 1
    return `rgba(${Number.parseInt(raw.slice(0, 2), 16)},${Number.parseInt(raw.slice(2, 4), 16)},${Number.parseInt(raw.slice(4, 6), 16)},${alpha.toFixed(3)})`
  }
  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const parts = rgb[1].split(",")
    const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3])
    return `rgba(${parts.slice(0, 3).map((part) => Number.parseFloat(part)).join(",")},${alpha.toFixed(3)})`
  }
  return normalized
}

function nearestColor(value: string, values: Record<string, string>, fallback: string) {
  const normalized = colorKey(value)
  return Object.entries(values).find(([, candidate]) => colorKey(candidate) === normalized)?.[0] ?? fallback
}

function parseRuns(root: HTMLElement): RuleTheoryTextRun[] {
  const result: RuleTheoryTextRun[] = []
  const visit = (node: Node, marks: Partial<RuleTheoryTextRun> = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) result.push({ text: node.textContent, ...marks })
      return
    }
    if (!(node instanceof HTMLElement)) return
    const style = node.style
    const face = node.getAttribute("face")?.toLowerCase() ?? ""
    const size = node.getAttribute("size")?.toLowerCase() ?? ""
    const next: Partial<RuleTheoryTextRun> = {
      ...marks,
      ...(node.tagName === "B" || node.tagName === "STRONG" || style.fontWeight === "bold" || style.fontWeight === "700" ? { bold: true } : {}),
      ...(node.tagName === "I" || node.tagName === "EM" || style.fontStyle === "italic" ? { italic: true } : {}),
      ...(node.tagName === "U" || style.textDecoration.includes("underline") ? { underline: true } : {}),
      ...(style.fontFamily || face ? { fontFamily: /georgia|serif/.test(style.fontFamily || face) ? "serif" : /mono|courier/.test(style.fontFamily || face) ? "mono" : "sans" } : {}),
      ...(style.fontSize || size ? { fontSize: /small|1|2/.test(style.fontSize || size) ? "small" : /large|4|5|6|7/.test(style.fontSize || size) ? "large" : "normal" } : {}),
      ...(style.color ? { color: nearestColor(style.color, colorValues, "default") as RuleTheoryTextRun["color"] } : {}),
      ...(style.backgroundColor ? { highlight: nearestColor(style.backgroundColor, highlightValues, "none") as RuleTheoryTextRun["highlight"] } : {}),
    }
    node.childNodes.forEach((child) => visit(child, next))
  }
  root.childNodes.forEach((child) => visit(child))
  return result.length ? result : [{ text: "" }]
}

function StyledRuns({ runs }: { runs?: RuleTheoryTextRun[] }) {
  return <>{(runs ?? []).map((run, index) => <span key={index} className={cn(run.bold && "font-bold", run.italic && "italic", run.underline && "underline", run.fontFamily && fontClasses[run.fontFamily], run.fontSize && sizeClasses[run.fontSize], run.color && colorClasses[run.color], run.highlight && highlightClasses[run.highlight])}>{run.text}</span>)}</>
}

function RenderBlock({ block }: { block: RuleTheoryBlock }) {
  if (block.type === "divider") return <hr className="my-6 border-border/50" />
  const textClass = cn(fontClasses[block.fontFamily ?? "sans"], sizeClasses[block.fontSize ?? "normal"], alignClasses[block.align ?? "left"])
  if (block.type === "title") return <h1 className={cn("text-3xl font-semibold tracking-tight", textClass)}><StyledRuns runs={block.segments} /></h1>
  if (block.type === "subtitle") return <h2 className={cn("text-xl font-medium text-muted-foreground", textClass)}><StyledRuns runs={block.segments} /></h2>
  if (["rule", "example", "exception", "tip"].includes(block.type)) return <section className="py-2"><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{blockLabels[block.type]}</p><p className={cn("whitespace-pre-wrap leading-relaxed", textClass)}><StyledRuns runs={block.segments} /></p></section>
  if (block.type === "bulleted-list" || block.type === "numbered-list") {
    const List = block.type === "bulleted-list" ? "ul" : "ol"
    return <List className={cn(block.type === "bulleted-list" ? "list-disc" : "list-decimal", "space-y-1 pl-6 leading-relaxed", textClass)}>{(block.items ?? []).map((item, index) => <li key={index}><StyledRuns runs={item} /></li>)}</List>
  }
  return <p className={cn("whitespace-pre-wrap leading-relaxed", textClass)}><StyledRuns runs={block.segments} /></p>
}

function EditableContent({ block, active, onFocus, onChange }: { block: RuleTheoryBlock; active: boolean; onFocus: () => void; onChange: (runs: RuleTheoryTextRun[]) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const lastBlockId = useRef(block.id)
  const html = runsToHtml(block.segments)
  useEffect(() => {
    if (!ref.current) return
    const blockChanged = lastBlockId.current !== block.id
    // Keep the DOM uncontrolled while the user types; rewriting innerHTML on every
    // keystroke would move the caret and make selecting text frustrating.
    if (!initialized.current || !active || blockChanged) ref.current.innerHTML = html
    initialized.current = true
    lastBlockId.current = block.id
  }, [active, block.id, html])
  return <div ref={ref} contentEditable suppressContentEditableWarning onFocus={onFocus} onInput={() => ref.current && onChange(parseRuns(ref.current))} className={cn("min-h-7 whitespace-pre-wrap outline-none", fontClasses[block.fontFamily ?? "sans"], sizeClasses[block.fontSize ?? "normal"], alignClasses[block.align ?? "left"], block.type === "title" && "text-3xl font-semibold tracking-tight", block.type === "subtitle" && "text-xl font-medium text-muted-foreground")} />
}

function TheoryEditorToolbar({ block, onChange, onCommand }: { block: RuleTheoryBlock; onChange: (next: RuleTheoryBlock) => void; onCommand: (command: string, value?: string) => void }) {
  const applyFont = (value: RuleTheoryBlock["fontFamily"]) => { onChange({ ...block, fontFamily: value }); onCommand("fontName", value === "serif" ? "Georgia" : value === "mono" ? "monospace" : "Arial") }
  const applySize = (value: RuleTheoryBlock["fontSize"]) => { onChange({ ...block, fontSize: value }); onCommand("fontSize", value === "small" ? "2" : value === "large" ? "5" : "3") }
  return <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/40 bg-background/95 p-2 shadow-sm">
    <select value={block.type} onChange={(event) => onChange({ ...block, type: event.target.value as RuleTheoryBlockType })} className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs">{(Object.keys(blockLabels) as RuleTheoryBlockType[]).map((type) => <option key={type} value={type}>{blockLabels[type]}</option>)}</select>
    {block.type !== "divider" && <>
      <select value={block.fontFamily ?? "sans"} onChange={(event) => applyFont(event.target.value as RuleTheoryBlock["fontFamily"])} className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select>
      <select value={block.fontSize ?? "normal"} onChange={(event) => applySize(event.target.value as RuleTheoryBlock["fontSize"])} className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option></select>
      <select value={block.align ?? "left"} onChange={(event) => onChange({ ...block, align: event.target.value as RuleTheoryBlock["align"] })} className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
      <select defaultValue="default" onChange={(event) => onCommand("foreColor", colorValues[event.target.value as keyof typeof colorValues])} className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"><option value="default">Text</option><option value="primary">Primary</option><option value="muted">Muted</option><option value="blue">Blue</option><option value="amber">Amber</option><option value="violet">Violet</option><option value="rose">Rose</option></select>
      <select defaultValue="none" onChange={(event) => onCommand("hiliteColor", highlightValues[event.target.value as keyof typeof highlightValues])} className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"><option value="none">Highlight</option><option value="yellow">Yellow</option><option value="blue">Blue</option><option value="green">Green</option><option value="rose">Rose</option></select>
      <Button type="button" variant="ghost" size="icon-sm" onMouseDown={(event) => { event.preventDefault(); onCommand("bold") }} title="Bold"><Bold className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" onMouseDown={(event) => { event.preventDefault(); onCommand("italic") }} title="Italic"><Italic className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" onMouseDown={(event) => { event.preventDefault(); onCommand("underline") }} title="Underline"><Underline className="size-3.5" /></Button>
    </>}
    <span className="ml-auto text-[11px] text-muted-foreground">Select text to format</span>
  </div>
}

type WorkspaceProps = { folderId: string; folderName: string; documents: RuleTheoryDocument[]; moveTargets?: Array<{ id: string; name: string }>; onBack: () => void; onAdd: (title: string, blocks: RuleTheoryBlock[]) => Promise<RuleTheoryDocument | null>; onUpdate: (document: RuleTheoryDocument) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; onMove?: (id: string, targetFolderId: string) => Promise<boolean> }

export function RuleTheoryWorkspace({ folderId, folderName, documents, moveTargets = [], onBack, onAdd, onUpdate, onDelete, onMove }: WorkspaceProps) {
  const [query, setQuery] = useState("")
  const [reading, setReading] = useState<RuleTheoryDocument | null>(null)
  const [editing, setEditing] = useState<RuleTheoryDocument | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftBlocks, setDraftBlocks] = useState<RuleTheoryBlock[]>([])
  const [activeBlock, setActiveBlock] = useState(0)
  const [dirty, setDirty] = useState(false)
  const selectionRef = useRef<Range | null>(null)
  const draftKey = `rulelab-theory-draft-${folderId}`
  useEffect(() => {
    const rememberSelection = () => {
      const selection = window.getSelection()
      if (selection?.rangeCount) selectionRef.current = selection.getRangeAt(0).cloneRange()
    }
    document.addEventListener("selectionchange", rememberSelection)
    return () => document.removeEventListener("selectionchange", rememberSelection)
  }, [])
  useEffect(() => { if (editing && dirty) localStorage.setItem(draftKey, JSON.stringify({ id: editing.id, title: draftTitle, blocks: draftBlocks })) }, [editing, dirty, draftBlocks, draftTitle, draftKey])
  const filtered = useMemo(() => documents.filter((document) => `${document.title} ${document.blocks.map(theoryBlockText).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [documents, query])
  const beginNew = () => { setReading(null); setEditing({ id: "", folderId, title: "", blocks: [], createdAt: 0, updatedAt: 0 }); setDraftTitle(""); setDraftBlocks([makeTheoryBlock("title"), makeTheoryBlock("paragraph")]); setActiveBlock(0); setDirty(true) }
  const beginEdit = (document: RuleTheoryDocument) => { setReading(null); setEditing(document); setDraftTitle(document.title); setDraftBlocks(normalizeTheoryBlocks(document.blocks)); setActiveBlock(0); setDirty(false) }
  const closeEditor = () => { if (dirty && !window.confirm("Discard unsaved theory changes?")) return; localStorage.removeItem(draftKey); setEditing(null); setDirty(false) }
  const save = async () => { if (!editing || !draftTitle.trim()) return; const next = { ...editing, title: draftTitle.trim(), blocks: draftBlocks }; if (editing.id) { if (!await onUpdate(next)) return; localStorage.removeItem(draftKey); setDirty(false); setEditing(null); setReading(next); return } const created = await onAdd(next.title, next.blocks); if (created) { localStorage.removeItem(draftKey); setDirty(false); setEditing(null); setReading(created) } }
  const updateBlock = (index: number, block: RuleTheoryBlock) => { setDraftBlocks((blocks) => blocks.map((item, itemIndex) => itemIndex === index ? block : item)); setDirty(true) }
  const moveBlock = (index: number, direction: -1 | 1) => { setDraftBlocks((blocks) => { const next = [...blocks]; const target = index + direction; if (target < 0 || target >= next.length) return blocks; [next[index], next[target]] = [next[target], next[index]]; return next }); setActiveBlock(Math.max(0, index + direction)); setDirty(true) }
  const dropBlock = (from: number, to: number) => { setDraftBlocks((blocks) => { const next = [...blocks]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next }); setActiveBlock(to); setDirty(true) }
  const duplicateBlock = (index: number) => { setDraftBlocks((blocks) => [...blocks.slice(0, index + 1), { ...blocks[index], id: crypto.randomUUID() }, ...blocks.slice(index + 1)]); setActiveBlock(index + 1); setDirty(true) }
  const deleteBlock = (index: number) => { setDraftBlocks((blocks) => blocks.length <= 1 ? blocks : blocks.filter((_, itemIndex) => itemIndex !== index)); setActiveBlock(Math.max(0, index - 1)); setDirty(true) }
  const duplicateDocument = async (document: RuleTheoryDocument) => { await onAdd(`${document.title} (copy)`, cloneBlocks(document.blocks)) }
  const updateActiveBlock = (next: RuleTheoryBlock) => { if (draftBlocks[activeBlock]) updateBlock(activeBlock, next) }
  const command = (name: string, value?: string) => {
    const savedRange = selectionRef.current
    const savedEditor = savedRange
      ? (savedRange.commonAncestorContainer instanceof HTMLElement
        ? savedRange.commonAncestorContainer.closest('[contenteditable="true"]')
        : savedRange.commonAncestorContainer.parentElement?.closest('[contenteditable="true"]'))
      : null
    try {
      const selection = window.getSelection()
      const focusedEditor = document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable
      if (savedRange && (!selection || selection.rangeCount === 0 || !focusedEditor)) {
        selection?.removeAllRanges()
        selection?.addRange(savedRange)
      }
      document.execCommand(name, false, value)
    } catch {
      // Formatting is a progressive enhancement; editing remains available even
      // in browsers that do not expose execCommand for a particular action.
    }
    const element = document.activeElement
    const editor = element instanceof HTMLElement && element.isContentEditable
      ? element
      : savedEditor
    editor?.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "format" }))
  }

  if (editing) return (
    <div className="min-h-[calc(100dvh-8rem)] bg-background">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/95 px-3 py-3 backdrop-blur sm:px-6"><Button variant="ghost" size="sm" onClick={closeEditor}><ArrowLeft className="mr-1.5 size-4" />Back</Button><Input value={draftTitle} onChange={(event) => { setDraftTitle(event.target.value); setDirty(true) }} placeholder="Theory title" className="min-w-0 flex-1 border-0 bg-transparent text-base font-semibold shadow-none focus-visible:ring-0" /><span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "Saved"}</span><Button size="sm" onClick={() => void save()} disabled={!draftTitle.trim()}><Save className="mr-1.5 size-4" />Save</Button></div>
      <div className="sticky top-[57px] z-20 border-b border-border/40 bg-background/95 px-3 py-2 backdrop-blur sm:px-6"><div className="mx-auto max-w-4xl"><TheoryEditorToolbar block={draftBlocks[activeBlock] ?? makeTheoryBlock("paragraph")} onChange={updateActiveBlock} onCommand={command} /></div></div>
      <article className="mx-auto min-h-[calc(100dvh-10rem)] max-w-4xl bg-card px-6 py-10 shadow-sm sm:my-6 sm:rounded-xl sm:px-16 sm:py-14">
        {draftBlocks.map((block, index) => <div key={block.id} draggable className={cn("group relative py-2", activeBlock === index && "ring-1 ring-primary/10 ring-offset-2 ring-offset-card")} onFocus={() => setActiveBlock(index)} onDragStart={(event) => event.dataTransfer.setData("text/rule-theory-index", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/rule-theory-index")); if (Number.isInteger(from) && from !== index) dropBlock(from, index) }}>
          {block.type === "divider" ? <hr className="my-6 border-border/60" /> : <EditableContent block={block.type === "bulleted-list" || block.type === "numbered-list" ? { ...block, segments: [{ text: (block.items ?? []).map(textOfRuns).join("\n") }] } : block} active={activeBlock === index} onFocus={() => setActiveBlock(index)} onChange={(runs) => updateBlock(index, block.type === "bulleted-list" || block.type === "numbered-list" ? { ...block, items: textOfRuns(runs).split(/\n/).map((line) => [{ text: line }]) } : { ...block, segments: runs })} />}
          <div className="pointer-events-none absolute -left-8 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"><GripVertical className="size-4 text-muted-foreground" /><Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveBlock(index, -1)}><ChevronUp className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={index === draftBlocks.length - 1} onClick={() => moveBlock(index, 1)}><ChevronDown className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => duplicateBlock(index)}><CopyPlus className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => deleteBlock(index)}><Trash2 className="size-3.5 text-destructive" /></Button></div>
        </div>)}
        <div className="mt-6 flex justify-center"><select defaultValue="paragraph" onChange={(event) => { const type = event.target.value as RuleTheoryBlockType; setDraftBlocks((blocks) => [...blocks, makeTheoryBlock(type)]); setActiveBlock(draftBlocks.length); setDirty(true); event.currentTarget.value = "paragraph" }} className="h-9 rounded-lg border border-border/50 bg-background px-3 text-sm"><option value="paragraph">Add block…</option>{(Object.keys(blockLabels) as RuleTheoryBlockType[]).map((type) => <option key={type} value={type}>{blockLabels[type]}</option>)}</select></div>
      </article>
    </div>
  )

  if (reading) return (
    <div className="min-h-[calc(100dvh-8rem)] rounded-2xl border border-border/50 bg-card/40 p-4 sm:p-8"><div className="mb-8 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-4"><Button variant="ghost" size="sm" onClick={() => setReading(null)}><ArrowLeft className="mr-1.5 size-4" />Back to theory</Button><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void duplicateDocument(reading)}><CopyPlus className="mr-1.5 size-4" />Duplicate</Button><Button variant="outline" size="sm" onClick={() => beginEdit(reading)}><Pencil className="mr-1.5 size-4" />Edit</Button><Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(theoryDocumentPreview(reading)) }}><Copy className="mr-1.5 size-4" />Copy summary</Button></div></div><article className="mx-auto max-w-3xl space-y-6"><h1 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">{folderName}</h1>{reading.blocks.map((block) => <RenderBlock key={block.id} block={block} />)}</article></div>
  )

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col items-center gap-6 pt-4 sm:pt-6"><h1 className="lab-title select-none text-center font-serif text-[clamp(3rem,14vw,5rem)] font-normal leading-none tracking-[-0.02em] text-foreground/15">RuleLab</h1></div>
      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex h-9 min-w-0 w-full items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-0 shadow-sm sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]"><Search className="size-4 shrink-0 text-muted-foreground/60" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or theory text" className="h-6 border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus-visible:ring-0" /></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={beginNew} className="h-9 gap-1.5 rounded-full px-3 text-[13px]"><Plus className="size-3.5" />Add theory note</Button><Button size="sm" variant="outline" disabled className="h-9 gap-1.5 rounded-full px-3 text-[13px]"><span className="font-medium text-blue-600 dark:text-blue-400">{folderName}</span> as {documents.length} notes</Button></div>
        </div>
        {filtered.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-border/50 px-6 py-16 text-center text-sm text-muted-foreground">No theory notes yet.</div> : <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((note) => (
          <article key={note.id} className="group rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition hover:border-primary/25 hover:shadow-md">
            <button type="button" className="block w-full text-left" onClick={() => setReading(note)}><h2 className="line-clamp-2 text-lg font-semibold tracking-tight text-foreground/85">{note.title}</h2><p className="mt-2 line-clamp-4 min-h-20 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{theoryDocumentPreview(note) || "Empty theory note"}</p><p className="mt-4 text-[11px] text-muted-foreground">{note.blocks.length} blocks · {new Date(note.updatedAt).toLocaleDateString("pt-BR")}</p></button>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-1 border-t border-border/30 pt-3"><Button variant="ghost" size="sm" onClick={() => beginEdit(note)}><Pencil className="mr-1.5 size-3.5" />Edit</Button><Button variant="ghost" size="sm" onClick={() => void duplicateDocument(note)}><CopyPlus className="mr-1.5 size-3.5" />Duplicate</Button>{onMove && moveTargets.length > 0 && <select defaultValue="" onChange={(event) => { if (event.target.value) void onMove(note.id, event.target.value); event.currentTarget.value = "" }} className="h-8 max-w-32 rounded-md border border-border/50 bg-background px-2 text-xs" aria-label="Move theory note"><option value="">Move…</option>{moveTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>}<Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Delete this theory note?")) void onDelete(note.id) }}><Trash2 className="mr-1.5 size-3.5 text-destructive" />Delete</Button></div>
          </article>
        ))}</div>}
      </div>
    </div>
  )
}
