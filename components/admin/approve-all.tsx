"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type Result = { approved: number; failed: { id: string; error: string }[]; skipped: number }

/** Publishes every record that passes the checks, as proposed. The reviewer still owns what goes live. */
export function ApproveAllReady({ ready }: { ready: number }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function approveAll() {
    if (
      !confirm(
        `Publish ${ready} record${ready === 1 ? "" : "s"} exactly as proposed? Students will see them straight away. ` +
          "Open any record first if you haven't checked it against its source."
      )
    )
      return
    setBusy(true)
    setError(null)
    const res = await fetch("/api/admin/review/approve-ready", { method: "POST" })
    const body = (await res.json().catch(() => null)) as (Result & { error?: string }) | null
    setBusy(false)
    if (!res.ok || !body) return setError(body?.error ?? "That didn't work. Try again.")
    setResult(body)
    router.refresh()
  }

  if (ready === 0 && !result) return null
  return (
    <Card data-testid="approve-all" className="gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={approveAll} loading={busy} disabled={ready === 0}>
          Approve all ready ({ready})
        </Button>
        <p className="text-sm text-muted-foreground">
          Records that pass every check. Ones that need fixing stay in the list.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-strong">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="text-sm">
          <p>
            Published {result.approved}. {result.failed.length > 0 && `${result.failed.length} could not be published:`}
          </p>
          {result.failed.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {result.failed.map((f) => (
                <li key={f.id}>
                  <a href={`/admin/review/${f.id}`} className="underline">
                    {f.id.slice(0, 8)}
                  </a>
                  : {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
