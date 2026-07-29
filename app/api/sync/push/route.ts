import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    {
      error: "A sincronização legada foi desativada. Use as rotas protegidas por Lab.",
    },
    { status: 410 },
  )
}
