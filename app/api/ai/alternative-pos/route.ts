import { NextResponse } from "next/server"

import { guardApiRequest } from "@/lib/api-security"

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "ai:alternative-pos", { limit: 30 })
  if (blocked) return blocked
  // Derivations are generated and reviewed atomically with the flashcard.
  // Keeping a second generator here previously allowed an unchecked response
  // to overwrite the reviewed family after the card had been persisted.
  await req.text()
  return NextResponse.json({ alternatives: [] })
}
