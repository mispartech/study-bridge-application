"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"

const input = "min-h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"

/** Account actions. Each needs a permission the server checks again; each lands in the audit log. */
export function UserActions({
  userId,
  suspended,
  canManage,
  canErase,
}: {
  userId: string
  suspended: boolean
  canManage: boolean
  canErase: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState("")
  const [confirm, setConfirm] = React.useState("")

  async function act(action: string, extra: Record<string, string> = {}) {
    setBusy(action)
    setMessage(null)
    const res = await fetch(`/api/admin/users/${userId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(null)
    if (!res.ok) return setMessage(body?.error ?? "That didn't work.")
    if (action === "delete") return router.replace("/admin/users")
    setMessage("Done.")
    router.refresh()
  }

  if (!canManage && !canErase) return null
  return (
    <div className="flex flex-col gap-3 text-sm">
      {canManage && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            Reason (needed to suspend or delete)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} maxLength={300} />
          </label>
          <div className="flex flex-wrap gap-2">
            {suspended ? (
              <Button size="sm" variant="secondary" loading={busy === "unsuspend"} onClick={() => act("unsuspend")}>
                Lift suspension
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "suspend"}
                disabled={reason.trim().length < 3}
                onClick={() => act("suspend", { reason })}
              >
                Suspend
              </Button>
            )}
            <Button size="sm" variant="secondary" loading={busy === "resend_link"} onClick={() => act("resend_link")}>
              Resend sign-in link
            </Button>
            {canErase && (
              <Button asChild size="sm" variant="secondary">
                <a href={`/api/admin/users/${userId}/export`}>Export their data</a>
              </Button>
            )}
          </div>
        </div>
      )}
      {canErase && (
        <div className="flex flex-col gap-2 rounded-card border border-danger/40 p-3">
          <p className="font-medium text-danger-strong">Delete this account</p>
          <p className="text-xs text-muted-foreground">
            Removes their profile, shortlist, tracker and emailed reports, and anonymises their activity. It can&apos;t
            be undone. Type DELETE to confirm.
          </p>
          <input
            aria-label="Type DELETE to confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={input}
          />
          <Button
            size="sm"
            variant="danger"
            loading={busy === "delete"}
            disabled={confirm !== "DELETE" || reason.trim().length < 3}
            onClick={() => act("delete", { reason, confirm })}
          >
            Delete account
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
