"use client"

import * as React from "react"

import { logActivity } from "@/lib/activity/client"
import { track } from "@/lib/analytics/track"

/** An official apply link that records the funnel's last step. */
export function ApplyLink({
  href,
  programmeId,
  children,
}: {
  href: string
  programmeId?: string
  children: React.ReactNode
}) {
  const clicked = () => {
    track("apply_clicked")
    logActivity("apply_clicked", programmeId ? { target: { type: "programme", id: programmeId } } : {})
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={clicked}>
      {children}
    </a>
  )
}
