import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { safeNext } from "@/lib/auth/safe-next"
import { Suspense } from "react"

import { ConsentForm } from "@/components/account/consent-form"
import { Logo } from "@/components/shell/app-shell"
import { supabaseServer } from "@/lib/auth/server"

export const metadata: Metadata = { title: "Your data", robots: { index: false } }

async function Consent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection()
  const { next } = await searchParams
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")
  const { data } = await supabase.from("student_profile").select("consent_given_at").maybeSingle()
  return <ConsentForm next={safeNext(next)} alreadyConsented={Boolean(data?.consent_given_at)} />
}

export default function Page({ searchParams }: PageProps<"/consent">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-4 pb-10">
      <header>
        <Logo />
      </header>
      <main>
        <Suspense fallback={<p className="text-sm text-muted-foreground">One moment…</p>}>
          <Consent searchParams={searchParams as Promise<{ next?: string }>} />
        </Suspense>
      </main>
    </div>
  )
}
