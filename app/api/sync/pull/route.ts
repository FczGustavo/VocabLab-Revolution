import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    {
      error: "A sincronização legada foi desativada. Confirme a identificação na guia Sincronização.",
    },
    { status: 410 },
  )
}
