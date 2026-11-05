import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { PlanBoard } from "@/components/plan/plan-board"
import { Card } from "@/components/ui/card"
import { currentUser, supabaseServer } from "@/lib/auth/server"
import { COUNTRY_LABEL } from "@/lib/match/labels"
import { defaultChecklist, timeline, type ChecklistItem } from "@/lib/plan/reminders"

export const metadata: Metadata = { title: "Plan" }

async function Plan() {
  await connection()
  if (!(await currentUser())) redirect("/sign-in?reason=save&next=/plan")
  const supabase = await supabaseServer()
  const [{ data: saved }, { data: trackers }] = await Promise.all([
    supabase
      .from("shortlist")
      .select(
        "programme:programme(id, title, last_verified_at, university:university(name, city, country), intake(deadlines))"
      ),
    supabase.from("application_tracker").select("programme_id, stage, checklist"),
  ])
  const now = new Date()
  const items = (saved ?? []).flatMap((row) => {
    const p = row.programme
    if (!p) return []
    const tracker = trackers?.find((t) => t.programme_id === p.id)
    return {
      programme_id: p.id,
      title: p.title,
      place: `${p.university?.name.replace(/^Demo — /, "")}, ${p.university?.city}, ${COUNTRY_LABEL[p.university?.country ?? ""]}`,
      last_verified_at: p.last_verified_at,
      stage: tracker?.stage ?? "researching",
      checklist: ((tracker?.checklist as ChecklistItem[] | undefined)?.length
        ? tracker!.checklist
        : defaultChecklist()) as ChecklistItem[],
      deadlines: p.intake.flatMap((i) => (i.deadlines ?? []) as { label: string; date: string }[]),
    }
  })
  if (items.length === 0) {
    return (
      <Card className="gap-2">
        <p className="text-sm">Save a programme and it will appear here with its deadlines and checklist.</p>
        <Link href="/discover" className="text-sm underline">
          See your matches
        </Link>
      </Card>
    )
  }
  return <PlanBoard items={items} upcoming={timeline(items, now)} />
}

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-extrabold">My plan</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your plan…</p>}>
        <Plan />
      </Suspense>
    </div>
  )
}
