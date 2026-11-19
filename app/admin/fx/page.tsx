import { connection } from "next/server"

import { MarketRateForm } from "@/components/admin/market-rate-form"
import { Card } from "@/components/ui/card"
import { serviceClient } from "@/lib/db/service"

const dated = (date: string) =>
  new Date(date).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })

export default async function Page() {
  await connection()
  const { data } = await serviceClient()
    .from("fx_rate")
    .select("base, rate, rate_kind, fetched_at, source_url, entered_by")
    .eq("is_demo", false)
    .order("fetched_at", { ascending: false })
    .limit(40)
  const rows = data ?? []
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-bold">Exchange rates</h1>
      <p className="text-sm text-muted-foreground">
        The reference rate refreshes hourly from ExchangeRate-API. Enter the market rate weekly, with its source.
      </p>
      <MarketRateForm />
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Recent rates</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Currency</th>
              <th>Kind</th>
              <th className="text-right">Naira per unit</th>
              <th>As of</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} data-testid="fx-row">
                <td>{r.base}</td>
                <td>{r.rate_kind === "official" ? "Reference" : "Market"}</td>
                <td className="text-right tabular-nums">{r.rate}</td>
                <td>{dated(r.fetched_at)}</td>
                <td>
                  {r.source_url ? (
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                      Link
                    </a>
                  ) : (
                    "None"
                  )}
                  {r.entered_by ? " (admin)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
