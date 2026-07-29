import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

import { guardApiRequest, readJsonWithLimit, safeApiError } from "@/lib/api-security"

const QuestionSchema = z.object({
  id: z.string().min(1).max(120),
  topic: z.string().min(1).max(120),
  subtopic: z.string().max(160).optional(),
  questionType: z.enum(["correct", "incorrect"]),
  questionText: z.string().min(1).max(4_000),
  options: z.array(z.object({
    letter: z.enum(["A", "B", "C", "D", "E"]),
    text: z.string().max(2_000),
    isAnswer: z.boolean(),
    explanation: z.string().max(4_000),
  })).min(2).max(5),
  createdAt: z.number().int().nonnegative(),
})

export async function POST(req: Request) {
  const blocked = guardApiRequest(req, "grammar:save", { limit: 10 })
  if (blocked) return blocked
  try {
    const body = await readJsonWithLimit<Record<string, unknown>>(req, 500_000)
    const parsed = z.array(QuestionSchema).max(50).safeParse(body.questions)
    if (!parsed.success && body.questions !== undefined) {
      return NextResponse.json({ error: "Invalid grammar question payload." }, { status: 400 })
    }
    const questions = parsed.success ? parsed.data : []

    if (!questions.length) {
      return NextResponse.json({ ok: true })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: true })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Store each field as a flat column — no JSONB `data` blob needed
    const rows = questions.map((q) => ({
      id: q.id,
      topic: q.topic,
      subtopic: q.subtopic ?? null,
      question_type: q.questionType,
      question_text: q.questionText,
      options: q.options,          // JSONB array
      created_at: new Date(q.createdAt).toISOString(),
    }))

    const { error } = await supabase
      .from("grammar_questions_cache")
      .upsert(rows, { onConflict: "id" })

    if (error) {
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return safeApiError(err, "Não foi possível salvar as questões.")
  }
}
