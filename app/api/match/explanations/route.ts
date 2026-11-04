import { NextResponse } from "next/server"
import { z } from "zod"

import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { explainTop } from "@/lib/match/explanations"
import { matchProfile, rank } from "@/lib/match"

/** Streams one JSON line per programme, so results can render before any explanation arrives. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = matchProfile.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile", issues: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const demoMode = demoModeEnabled()
  const now = new Date()
  const catalogue = await loadCatalogue(demoMode)
  const result = rank(parsed.data, catalogue, { now, demoMode })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const explanation of explainTop(parsed.data, result, catalogue, { now })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(explanation)}\n`))
        }
      } catch (err) {
        console.error("Explanations failed:", err instanceof Error ? err.message : err)
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } })
}
