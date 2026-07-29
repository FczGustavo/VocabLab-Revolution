import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { GrammarQuestion } from "@/lib/types"

import { guardApiRequest, readJsonWithLimit } from "@/lib/api-security"

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "grammar:fetch", { limit: 30 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 100_000)
    const topics = Array.isArray(body?.topics)
      ? body.topics.filter((value): value is string => typeof value === "string" && value.length <= 120).slice(0, 50)
      : []
    const excludeIds = Array.isArray(body?.excludeIds)
      ? body.excludeIds.filter((value): value is string => typeof value === "string" && value.length <= 120).slice(0, 1_000)
      : []
    // subtopics: Record<topicId, string[]> — if a topic has entries, only those subtopics are wanted
    const subtopics: Record<string, string[]> = {}
    if (body.subtopics && typeof body.subtopics === "object" && !Array.isArray(body.subtopics)) {
      for (const [topic, values] of Object.entries(body.subtopics)) {
        if (Array.isArray(values)) {
          subtopics[topic] = values.filter((value): value is string => typeof value === "string")
        }
      }
    }
    const limit = typeof body?.limit === "number"
      ? Math.max(1, Math.min(Math.trunc(body.limit), 400))
      : 80

    if (!topics.length) {
      return NextResponse.json({ questions: [] })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ questions: [] })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase
      .from("grammar_questions_cache")
      .select("id, topic, subtopic, question_type, question_text, options, created_at")
      .in("topic", topics)
      .limit(limit)

    if (error) {
      console.error("[grammar/fetch]", error.message)
      return NextResponse.json({ questions: [] })
    }

    // Reconstruct GrammarQuestion objects from flat columns
    const questions: GrammarQuestion[] = (data ?? [])
      .filter((row) => {
        if (excludeIds.includes(row.id)) return false
        // If the user selected specific subtopics for this topic, enforce them
        const wantedSubs = subtopics[row.topic]
        if (wantedSubs && wantedSubs.length > 0) {
          return wantedSubs.includes(row.subtopic)
        }
        return true
      })
      .map((row) => ({
        id: row.id,
        topic: row.topic,
        subtopic: row.subtopic ?? undefined,
        questionType: row.question_type as "correct" | "incorrect",
        questionText: row.question_text,
        options: row.options,
        createdAt: new Date(row.created_at).getTime(),
      }))

    return NextResponse.json({ questions })
  } catch (err) {
    console.error("[grammar/fetch] unexpected error:", err)
    return NextResponse.json({ questions: [] })
  }
}
