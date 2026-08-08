import { describe, expect, it } from "vitest"
import { makeTheoryBlock, normalizeTheoryDocument, theoryDocumentPreview } from "./rule-theory"

describe("rule theory documents", () => {
  it("normalizes unsafe text and keeps structured block types", () => {
    const document = normalizeTheoryDocument({
      id: "note-1",
      folderId: "folder-1",
      title: "  Grammar <script>alert(1)</script>  ",
      blocks: [
        { ...makeTheoryBlock("rule"), segments: [{ text: "Use <b>this</b> rule" }] },
        { ...makeTheoryBlock("divider"), type: "not-a-real-type" as never },
      ],
      createdAt: 1,
      updatedAt: 2,
    })

    expect(document.title).toBe("Grammar alert(1)")
    expect(document.blocks[0].segments?.[0].text).toBe("Use this rule")
    expect(document.blocks[1].type).toBe("paragraph")
  })

  it("builds searchable previews from all block text", () => {
    const document = normalizeTheoryDocument({ id: "note-2", folderId: "folder-1", title: "Past tense", blocks: [{ ...makeTheoryBlock("paragraph"), segments: [{ text: "Worked examples" }] }], createdAt: 1, updatedAt: 1 })
    expect(theoryDocumentPreview(document)).toContain("Worked examples")
  })

  it("keeps only the allowed inline font options", () => {
    const document = normalizeTheoryDocument({
      id: "note-3",
      folderId: "folder-1",
      title: "Formatting",
      blocks: [{ ...makeTheoryBlock("paragraph"), segments: [
        { text: "Serif", fontFamily: "serif", fontSize: "large" },
        { text: "Unsafe", fontFamily: "comic-sans" as never, fontSize: "huge" as never },
      ] }],
    })
    expect(document.blocks[0].segments).toEqual([
      { text: "Serif", fontFamily: "serif", fontSize: "large" },
      { text: "Unsafe" },
    ])
  })
})
