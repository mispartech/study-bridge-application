import { NextResponse } from "next/server"

import { audit } from "@/lib/activity/audit"
import { toCsv } from "@/lib/admin/csv"
import { DATASETS } from "@/lib/admin/exports"
import { parseRange } from "@/lib/admin/range"
import { staffFromRequest } from "@/lib/auth/admin"
import { failureResponse } from "@/lib/server-errors"

/** CSV for one admin dataset and date range. Recorded in the audit log, as the spec requires. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const name = url.searchParams.get("dataset") ?? ""
  const dataset = Object.hasOwn(DATASETS, name) ? DATASETS[name] : undefined
  if (!dataset) return NextResponse.json({ error: "Unknown dataset" }, { status: 404 })
  const { user, denied } = await staffFromRequest(dataset.permission)
  if (denied) return denied
  const range = parseRange(Object.fromEntries(url.searchParams), new Date())
  try {
    const rows = await dataset.rows(range)
    await audit(user, "export_downloaded", {
      targetType: "dataset",
      targetId: name,
      after: { from: range.from.toISOString(), to: range.to.toISOString(), rows: rows.length },
    })
    const filename = `studybridge-${name}-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv`
    return new NextResponse(toCsv(rows, dataset.columns), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    })
  } catch (err) {
    return failureResponse(err)
  }
}
