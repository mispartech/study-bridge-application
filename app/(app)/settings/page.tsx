import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { SignOutButton } from "@/components/account/sign-out-button"
import { DataControls, PlusCard } from "@/components/account/settings-actions"
import { Card } from "@/components/ui/card"
import { currentUser, supabaseServer } from "@/lib/auth/server"
import { PLUS, PLUS_ENDS } from "@/lib/billing/paystack"
import { formatShort, type Currency } from "@/lib/money"

export const metadata: Metadata = { title: "Settings", robots: { index: false } }

async function Settings({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  await connection()
  const user = await currentUser()
  if (!user) redirect("/sign-in?next=/settings")
  const { paid } = await searchParams
  const supabase = await supabaseServer()
  const { data: subscription } = await supabase.from("subscription").select("plan, current_period_end").maybeSingle()
  const end = subscription?.current_period_end
  const plus = subscription?.plan === "plus" && (!end || new Date(end) > new Date())
  return (
    <>
      <Card className="gap-1">
        <h2 className="font-heading text-lg font-bold">Account</h2>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
        <SignOutButton />
      </Card>
      <PlusCard
        plus={plus}
        renews={end ?? null}
        confirming={paid === "1" && !plus}
        price={formatShort(BigInt(PLUS.amount_minor), PLUS.currency as Currency)}
        cycle={PLUS.cycle}
        validUntil={PLUS_ENDS.toISOString()}
      />
      <DataControls />
    </>
  )
}

export default function Page({ searchParams }: PageProps<"/settings">) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Settings</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Settings searchParams={searchParams as Promise<{ paid?: string }>} />
      </Suspense>
    </div>
  )
}
