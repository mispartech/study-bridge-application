"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"

/**
 * Asks before an action. With `typed`, the action stays disabled until that exact word is typed: use it for
 * anything that can't be undone. Built on the native <dialog>, so focus is trapped and Escape cancels.
 */
export function ConfirmDialog({
  trigger,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  tone = "primary",
  typed,
  disabled,
  onConfirm,
}: {
  trigger: string
  triggerVariant?: "outline" | "ghost" | "danger" | "primary" | "secondary"
  title: string
  description?: React.ReactNode
  confirmLabel: string
  tone?: "primary" | "danger"
  typed?: string
  disabled?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const dialog = React.useRef<HTMLDialogElement>(null)
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const inputId = React.useId()
  const ready = !typed || text === typed

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={triggerVariant}
        disabled={disabled}
        onClick={() => {
          setText("")
          dialog.current?.showModal()
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={dialog}
        aria-label={title}
        className="m-auto w-[min(100%-2rem,28rem)] rounded-card border border-border bg-surface p-0 text-ink backdrop:bg-scrim"
      >
        <form
          method="dialog"
          className="flex flex-col gap-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!ready) return
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
              dialog.current?.close()
            }
          }}
        >
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
          {typed && (
            <label htmlFor={inputId} className="flex flex-col gap-1 text-sm">
              Type {typed} to confirm
              <input
                id={inputId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
                className="min-h-11 rounded-button border border-border bg-surface px-3"
              />
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} disabled={!ready} loading={busy}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
