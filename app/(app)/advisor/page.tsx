import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { AdvisorChat } from "@/components/advisor/advisor-chat"
import { advisorQuotaStatus } from "@/lib/ai/advisor-quota"
import { supabaseServer } from "@/lib/auth/server"

export const metadata: Metadata = { title: "Advisor" }

async function Advisor() {
  await connection()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in?reason=advisor&next=/advisor")
  const { data } = await supabase.from("student_profile").select("consent_given_at").maybeSingle()
  if (!data?.consent_given_at) redirect("/consent?next=/advisor")
  const quota = await advisorQuotaStatus(user.id)
  return <AdvisorChat initialUsed={quota.used} limit={quota.limit} />
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the advisor…</p>}>
      <Advisor />
    </Suspense>
  )
}
