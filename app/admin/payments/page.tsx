import { connection } from "next/server"

import { RangeFilter } from "@/components/admin/range-filter"
import { RefundButton } from "@/components/admin/refund-button"
import { Card } from "@/components/ui/card"
import { parseRange } from "@/lib/admin/range"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

const nf = new Intl.NumberFormat("en-GB")
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—")
const money = (minor: number, currency: string) => `${currency} ${nf.format(Math.round(minor / 100))}`

/** Paystack transactions. Refunds are admin-only and audited. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  await connection()
  await requireStaff("payments")
  const range = parseRange(await searchParams, new Date())
  const { data, error } = await serviceClient()
    .from("payment")
    .select("reference, user_id, amount_minor, currency, status, created_at, paid_at, refunded_at")
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(500)
  const rows = data ?? []
  const byStatus = new Map<string, { n: number; totals: Map<string, number> }>()
  for (const p of rows) {
    const s = byStatus.get(p.status) ?? { n: 0, totals: new Map() }
    s.n += 1
    s.totals.set(p.currency, (s.totals.get(p.currency) ?? 0) + p.amount_minor)
    byStatus.set(p.status, s)
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">Payments</h1>
      <p className="text-sm text-muted-foreground">Paystack is in test mode: no real card has been charged.</p>
      <RangeFilter path="/admin/payments" range={range} />
      <section className="grid gap-3 sm:grid-cols-4">
        {["paid", "pending", "failed", "refunded"].map((status) => {
          const s = byStatus.get(status)
          return (
            <Card key={status} className="gap-1">
              <h2 className="text-sm text-muted-foreground capitalize">{status}</h2>
              <p className="font-heading text-2xl font-extrabold tabular-nums">{s?.n ?? 0}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {s ? [...s.totals].map(([c, m]) => money(m, c)).join(", ") : "—"}
              </p>
            </Card>
          )
        })}
      </section>
      {error && <p className="text-danger-strong">Could not load payments: {error.message}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments in this range.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Payments">
          <table className="w-full min-w-[48rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                {["Started", "Reference", "Amount", "Status", "Paid", "Refunded", ""].map((h) => (
                  <th key={h} scope="col" className="py-2 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.reference} data-testid="payment-row" className="border-t border-border">
                  <td className="py-2 pr-4 whitespace-nowrap">{time(p.created_at)}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{p.reference}</td>
                  <td className="py-2 pr-4">{money(p.amount_minor, p.currency)}</td>
                  <td className="py-2 pr-4">{p.status}</td>
                  <td className="py-2 pr-4">{time(p.paid_at)}</td>
                  <td className="py-2 pr-4">{time(p.refunded_at)}</td>
                  <td className="py-2">{p.status === "paid" && <RefundButton reference={p.reference} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
