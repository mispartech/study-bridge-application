import { connection } from "next/server"

import { EstimateForm } from "@/components/admin/estimate-form"
import { Card } from "@/components/ui/card"
import { serviceClient } from "@/lib/db/service"
import { formatShort, type Currency } from "@/lib/money"

const EVIDENCE_LINK_SECONDS = 600

export default async function Page() {
  await connection()
  const db = serviceClient()
  const { data } = await db.from("cost_estimate").select("*").eq("is_demo", false).order("country").order("item")
  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      if (!row.evidence_path) return { ...row, evidence: null }
      const { data: link } = await db.storage.from("evidence").createSignedUrl(row.evidence_path, EVIDENCE_LINK_SECONDS)
      return { ...row, evidence: link?.signedUrl ?? null }
    })
  )
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Flights and health cover</h1>
      <p className="text-sm text-muted-foreground">
        Flight figures are the median of dated quotes, with a screenshot. They show as estimates to students.
      </p>
      <EstimateForm />
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Current estimates</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} data-testid="estimate-row">
              {r.item === "flights" ? "Flights" : "Health cover"}: {r.city ?? r.region ?? r.country},{" "}
              {formatShort(BigInt(r.amount_minor), r.currency as Currency)}
              {r.per_year ? " a year" : ""}
              {r.observed_on ? `, quoted ${r.observed_on}` : ""} ({r.confidence}){" "}
              <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                Source
              </a>
              {r.evidence && (
                <>
                  {" "}
                  <a href={r.evidence} target="_blank" rel="noopener noreferrer" className="underline">
                    Screenshot
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
