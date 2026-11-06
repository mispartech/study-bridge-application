"use client"

import * as React from "react"

import { track } from "@/lib/analytics/track"

/** An official apply link that records the funnel's last step. */
export function ApplyLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => track("apply_clicked")}>
      {children}
    </a>
  )
}
