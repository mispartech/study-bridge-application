"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { X } from "lucide-react"

/**
 * A side panel on desktop and a full-screen sheet on a phone. Open or closed is decided by the page from a
 * query parameter, so a drawer has its own URL; closing goes to `closeHref` (the same page without it).
 * Escape closes it, focus moves into it when it opens, and the page behind can't be scrolled.
 */
export function DetailDrawer({
  title,
  closeHref,
  children,
}: {
  title: string
  closeHref: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const panel = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  React.useEffect(() => {
    panel.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false })
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener("keydown", onKey)
    }
  }, [closeHref, router])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-slot="detail-drawer">
      <Link href={closeHref} scroll={false} aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-scrim" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-surface shadow-xl outline-none sm:max-w-xl sm:rounded-l-card"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-heading text-lg font-bold">
            {title}
          </h2>
          <Link
            href={closeHref}
            scroll={false}
            className="grid size-11 place-items-center rounded-button hover:bg-surface-subtle"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Close</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
