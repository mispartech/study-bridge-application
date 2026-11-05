import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { SignOutButton } from "@/components/account/sign-out-button"
import { Card } from "@/components/ui/card"
import { currentUser } from "@/lib/auth/server"

export const metadata: Metadata = { title: "Your account", robots: { index: false } }

async function Account() {
  await connection()
  const user = await currentUser()
  if (!user) redirect("/sign-in?next=/account")
  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="text-2xl font-extrabold">Your account</h1>
      <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      <Link href="/settings" className="text-sm underline">
        Plan, data and settings
      </Link>
      <SignOutButton />
    </Card>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Account />
    </Suspense>
  )
}
