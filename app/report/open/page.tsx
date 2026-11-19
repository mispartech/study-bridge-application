import type { Metadata } from "next"
import { Suspense } from "react"

import { Logo } from "@/components/shell/app-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "Open your results", robots: { index: false, follow: false } }

/** Landing page for the email's "View and update your results" button. One tap signs the student in. */
async function OpenForm({ searchParams }: { searchParams: Promise<{ r?: string; t?: string }> }) {
  const { r = "", t = "" } = await searchParams
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-4 pb-10">
      <header>
        <Logo />
      </header>
      <Card className="gap-3">
        <h1 className="text-2xl font-extrabold">Open your results</h1>
        <p className="text-sm text-muted-foreground">
          This signs you in with the email address the report was sent to, so you can update your matches, save
          programmes and get reminders. No password needed.
        </p>
        <form method="post" action="/api/report/claim">
          <input type="hidden" name="r" value={r} />
          <input type="hidden" name="t" value={t} />
          <Button type="submit" block>
            Open my results
          </Button>
        </form>
      </Card>
    </div>
  )
}

type Search = { searchParams: Promise<Record<string, string | undefined>> }

export default function Page({ searchParams }: Search) {
  return (
    <Suspense>
      <OpenForm searchParams={searchParams} />
    </Suspense>
  )
}
