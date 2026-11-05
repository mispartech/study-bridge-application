import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { currentUser, supabaseServer } from "@/lib/auth/server"
import { COUNTRY_LABEL } from "@/lib/match/labels"

export const metadata: Metadata = { title: "Shortlist" }

const verified = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

async function Saved() {
  await connection()
  if (!(await currentUser())) {
    return (
      <Card className="gap-3">
        <p className="text-sm">Sign in to keep the programmes you save.</p>
        <Button asChild>
          <Link href="/sign-in?reason=save&next=/shortlist">Sign in</Link>
        </Button>
      </Card>
    )
  }
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from("shortlist")
    .select("programme:programme(id, title, last_verified_at, university:university(name, city, country))")
    .order("created_at", { ascending: false })
  const programmes = (data ?? []).flatMap((row) => row.programme ?? [])
  if (programmes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing saved yet.{" "}
        <Link href="/discover" className="underline">
          See your matches
        </Link>
        .
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {programmes.map((p) => (
        <li key={p.id}>
          <Card data-testid="shortlist-item" className="gap-1">
            <h2 className="font-heading text-base font-bold">
              <Link href={`/programmes/${p.id}`} className="underline-offset-4 hover:underline">
                {p.title}
              </Link>
            </h2>
            <p className="text-sm text-muted-foreground">
              {p.university?.name.replace(/^Demo — /, "")}, {p.university?.city},{" "}
              {COUNTRY_LABEL[p.university?.country ?? ""]}
            </p>
            <p className="text-xs text-muted-foreground">Verified {verified(p.last_verified_at)}</p>
          </Card>
        </li>
      ))}
    </ul>
  )
}

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Shortlist</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your shortlist…</p>}>
        <Saved />
      </Suspense>
    </div>
  )
}
