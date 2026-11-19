import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { AdvisorChat } from "@/components/advisor/advisor-chat"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { advisorQuotaStatus } from "@/lib/ai/advisor-quota"
import { supabaseServer } from "@/lib/auth/server"
import { PROFILE_COOKIE } from "@/lib/match/profile-store"
import { DEVICE_COOKIE, LIMITS } from "@/lib/security/limits"
import { hashKey, peek } from "@/lib/security/rate-limit"

export const metadata: Metadata = { title: "Advisor" }

function NeedsProfile() {
  return (
    <Card className="mx-auto max-w-lg gap-2">
      <h1 className="text-2xl font-extrabold">Ask the advisor</h1>
      <p className="text-sm text-muted-foreground">
        The advisor answers using your grades and budget. Run a quick match first, then come back.
      </p>
      <Button asChild block>
        <Link href="/">Start a quick match</Link>
      </Button>
    </Card>
  )
}

async function Advisor() {
  await connection()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data } = await supabase.from("student_profile").select("consent_given_at").maybeSingle()
    if (!data?.consent_given_at) redirect("/consent?next=/advisor")
    const quota = await advisorQuotaStatus(user.id)
    return <AdvisorChat initialUsed={quota.used} limit={quota.limit} anonymous={false} />
  }
  // Value before account: anonymous visitors get a few free messages a day, using the profile in their browser.
  const store = await cookies()
  if (!store.get(PROFILE_COOKIE)?.value) return <NeedsProfile />
  const device = store.get(DEVICE_COOKIE)?.value
  const limit = LIMITS.advisorAnonymous.device
  const used = device ? await peek(limit, hashKey(`device:${device}`)) : 0
  return <AdvisorChat initialUsed={used} limit={limit.limit} anonymous />
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the advisor…</p>}>
      <Advisor />
    </Suspense>
  )
}
