import { connection, NextResponse } from "next/server"

import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

/** The goals a student can choose in the deep search, as the admin has set them. Labels only, no weights. */
export async function GET() {
  await connection() // read per request, never prerendered at build time
  const catalogue = await loadCatalogue(demoModeEnabled()).catch((err: unknown) => failureResponse(err))
  if (catalogue instanceof NextResponse) return catalogue
  return NextResponse.json(
    {
      pathways: (catalogue.pathways ?? []).map(({ key, label, description }) => ({ key, label, description })),
    },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } }
  )
}
