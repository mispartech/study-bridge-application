"use client"

import { ThumbsDown, ThumbsUp } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { logActivity } from "@/lib/activity/client"
import { DISMISS_LABEL, DISMISS_REASONS, THUMBS_LABEL, THUMBS_REASONS, type TARGET_TYPES } from "@/lib/activity/events"
import { cn } from "@/lib/utils"

type DismissReason = (typeof DISMISS_REASONS)[number]
type ThumbsReason = (typeof THUMBS_REASONS)[number]

/** "Not for me" with a reason. The card collapses (with Undo); the reason helps improve matching. */
export function NotForMe({
  programmeId,
  dismissed,
  onDismiss,
}: {
  programmeId: string
  dismissed: DismissReason | null
  onDismiss: (reason: DismissReason | null) => void
}) {
  const [choosing, setChoosing] = React.useState(false)
  if (dismissed) return null
  if (!choosing) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>
        Not for me
      </Button>
    )
  }
  return (
    <div role="group" aria-label="Why isn't this for you?" className="flex w-full flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Why?</span>
      {DISMISS_REASONS.map((reason) => (
        <Button
          key={reason}
          size="sm"
          variant="outline"
          onClick={() => {
            logActivity("programme_dismissed", {
              target: { type: "programme", id: programmeId },
              properties: { reason },
            })
            setChoosing(false)
            onDismiss(reason)
          }}
        >
          {DISMISS_LABEL[reason]}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={() => setChoosing(false)}>
        Cancel
      </Button>
    </div>
  )
}

/** Thumbs up or down, with a reason for down. Used on explanations and advisor answers. */
export function Thumbs({
  label,
  target,
  kind,
}: {
  label: string
  target: { type: (typeof TARGET_TYPES)[number]; id: string }
  kind: "explanation" | "advisor"
}) {
  const [vote, setVote] = React.useState<"up" | "down" | null>(null)
  const [reasoned, setReasoned] = React.useState(false)
  const send = (up: boolean, reason?: ThumbsReason) =>
    kind === "advisor"
      ? logActivity("advisor_thumbs", { target, properties: { up, ...(reason && { reason }) } })
      : logActivity("suggestion_feedback", { target, properties: { helpful: up, ...(reason && { reason }) } })

  if (vote === "up" || reasoned) return <p className="text-xs text-muted-foreground">Thanks for the feedback.</p>
  if (vote === "down") {
    return (
      <div role="group" aria-label="What was wrong?" className="flex flex-wrap items-center gap-1.5">
        {THUMBS_REASONS.map((reason) => (
          <Button
            key={reason}
            size="sm"
            variant="outline"
            onClick={() => {
              send(false, reason)
              setReasoned(true)
            }}
          >
            {THUMBS_LABEL[reason]}
          </Button>
        ))}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {(["up", "down"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-label={v === "up" ? "Helpful" : "Not helpful"}
          onClick={() => {
            setVote(v)
            if (v === "up") send(true)
          }}
          className={cn("grid size-11 place-items-center rounded-button text-muted-foreground hover:bg-surface-subtle")}
        >
          {v === "up" ? <ThumbsUp className="size-4" aria-hidden /> : <ThumbsDown className="size-4" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

export const dismissLabel = (reason: DismissReason) => DISMISS_LABEL[reason]
