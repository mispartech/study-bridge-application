import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { RoleToggle } from "@/components/admin/role-toggle"
import { Card } from "@/components/ui/card"
import { formatUsd, totals } from "@/lib/admin/users"
import { serviceClient } from "@/lib/db/service"
import { fieldLabel } from "@/lib/match/labels"
import { formatShort } from "@/lib/money"
import { estimateCostUsd, getSettings } from "@/lib/settings"

const nf = new Intl.NumberFormat("en-GB")
const time = (iso: string) => iso.slice(0, 16).replace("T", " ")
const RECENT = 50

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  const db = serviceClient()
  const { data: auth } = await db.auth.admin.getUserById(id)
  const user = auth?.user
  if (!user) notFound()
  const [usage, searches, shortlist, advisor, settings] = await Promise.all([
    db
      .from("ai_usage")
      .select("id, created_at, task, provider, model, input_tokens, output_tokens, latency_ms, success, error")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(RECENT),
    db.from("search_log").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(RECENT),
    db
      .from("shortlist")
      .select("programme_id, student_profile!inner(user_id)", { count: "exact", head: true })
      .eq("student_profile.user_id", id),
    db
      .from("advisor_daily_usage")
      .select("day, messages")
      .eq("user_id", id)
      .order("day", { ascending: false })
      .limit(14),
    getSettings(),
  ])
  const calls = usage.data ?? []
  const sum = totals(calls, settings.model_prices)
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/users" className="text-sm underline underline-offset-4">
        All users
      </Link>
      <Card className="gap-2">
        <h1 className="font-heading text-xl font-bold break-all">{user.email ?? user.id}</h1>
        <p className="text-sm text-muted-foreground">
          Signed up {time(user.created_at)} · Last sign-in {user.last_sign_in_at ? time(user.last_sign_in_at) : "never"}{" "}
          · Shortlisted {shortlist.count ?? 0}
        </p>
        <p className="text-sm">
          Last {calls.length} AI calls: {nf.format(sum.input_tokens + sum.output_tokens)} tokens,{" "}
          {formatUsd(sum.cost_usd)}
        </p>
        <RoleToggle userId={user.id} admin={user.app_metadata?.role === "admin"} />
      </Card>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Searches</h2>
        {(searches.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No searches while signed in.</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Searches">
            <table className="w-full min-w-[40rem] text-left text-sm tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  {["When", "Course", "Countries", "Budget", "Matches", "Closest", "Data confidence"].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(searches.data ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2 pr-4 whitespace-nowrap">{time(s.created_at)}</td>
                    <td className="py-2 pr-4">{s.fields.map(fieldLabel).join(", ") || "any"}</td>
                    <td className="py-2 pr-4">{s.countries.join(", ") || "any"}</td>
                    <td className="py-2 pr-4">
                      {s.budget_ngn_minor === null ? "not given" : formatShort(s.budget_ngn_minor, "NGN")}
                    </td>
                    <td className="py-2 pr-4">{s.ranked}</td>
                    <td className="py-2 pr-4">{s.near_misses}</td>
                    <td className="py-2 pr-4">{s.data_confidence === null ? "—" : `${s.data_confidence}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">AI generations</h2>
        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI calls.</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="AI generations">
            <table className="w-full min-w-[44rem] text-left text-sm tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  {["When", "Task", "Model", "In", "Out", "Cost", "Time", "Result"].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 pr-4 whitespace-nowrap">{time(c.created_at)}</td>
                    <td className="py-2 pr-4">{c.task}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{c.model}</td>
                    <td className="py-2 pr-4">{nf.format(c.input_tokens ?? 0)}</td>
                    <td className="py-2 pr-4">{nf.format(c.output_tokens ?? 0)}</td>
                    <td className="py-2 pr-4">
                      {formatUsd(
                        estimateCostUsd(
                          settings.model_prices,
                          c.provider,
                          c.model,
                          c.input_tokens ?? 0,
                          c.output_tokens ?? 0
                        )
                      )}
                    </td>
                    <td className="py-2 pr-4">{nf.format(c.latency_ms)} ms</td>
                    <td
                      className={c.success ? "py-2 pr-4" : "py-2 pr-4 text-danger-strong"}
                      title={c.error ?? undefined}
                    >
                      {c.success ? "ok" : "failed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Advisor messages, last 14 days</h2>
        <p className="text-sm tabular-nums">
          {(advisor.data ?? []).map((d) => `${d.day}: ${d.messages}`).join(" · ") || "None"}
        </p>
      </Card>
    </div>
  )
}
