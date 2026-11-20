import type { Metadata } from "next"
import { Suspense } from "react"

import { Logo } from "@/components/shell/app-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } }

async function UnsubscribeForm({ searchParams }: { searchParams: Promise<{ r?: string; t?: string; done?: string }> }) {
  const { r = "", t = "", done } = await searchParams
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-4 pb-10">
      <header>
        <Logo />
      </header>
      <Card className="gap-3">
        {done ? (
          <>
            <h1 className="text-2xl font-extrabold">Done</h1>
            <p data-testid="unsubscribed" className="text-sm text-muted-foreground">
              Your report and the email address we kept with it are deleted. You won&apos;t hear from us about it again.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold">Unsubscribe and delete your report</h1>
            <p className="text-sm text-muted-foreground">
              This deletes the report we emailed you and stops any reminders or updates for it.
            </p>
            <form method="post" action="/api/report/unsubscribe">
              <input type="hidden" name="r" value={r} />
              <input type="hidden" name="t" value={t} />
              <Button type="submit" variant="danger" block>
                Unsubscribe and delete
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}

type Search = { searchParams: Promise<Record<string, string | undefined>> }

export default function Page({ searchParams }: Search) {
  return (
    <Suspense>
      <UnsubscribeForm searchParams={searchParams} />
    </Suspense>
  )
}
