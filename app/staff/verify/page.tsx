import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { Logo } from "@/components/shell/app-shell"
import { MfaVerify } from "@/components/staff/mfa-verify"
import { Card } from "@/components/ui/card"
import { checkStaff } from "@/lib/auth/admin"

export const metadata: Metadata = { title: "Verify it's you", robots: { index: false, follow: false } }

async function Verify() {
  await connection()
  const check = await checkStaff()
  if (check.ok) redirect("/admin")
  if (check.reason === "signed_out") redirect("/sign-in?next=/admin")
  if (check.reason === "not_staff") notFound()
  return (
    <Card className="gap-3">
      <h1 className="text-2xl font-extrabold">Verify it&apos;s you</h1>
      <p className="text-sm text-muted-foreground">
        Staff accounts need a second step: a code from an authenticator app on your phone.
      </p>
      <MfaVerify />
    </Card>
  )
}

export default function Page() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-4 pb-10">
      <header>
        <Logo />
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Verify />
      </Suspense>
    </div>
  )
}
