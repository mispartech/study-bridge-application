import type { Metadata } from "next"

import { FreshnessBadge } from "@/components/ui/freshness-badge"
import { DEMO_NOW, daysBefore } from "../_components/demo-time"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "FreshnessBadge" }

export default function FreshnessBadgePage() {
  return (
    <>
      <DemoHeader title="FreshnessBadge">
        Shows how recently a record&apos;s last_verified_at was checked. Green under 90 days, amber from day 90. The
        current time is passed in as `now`, so the badge stays a pure server component.
      </DemoHeader>

      <Example
        title="Fresh and aging"
        note={`Relative to a fixed demo date (${DEMO_NOW.toISOString().slice(0, 10)}).`}
        code={`<FreshnessBadge lastVerifiedAt={row.last_verified_at} now={now} sourceUrl={row.source_url} />`}
      >
        <FreshnessBadge lastVerifiedAt={daysBefore(0)} now={DEMO_NOW} />
        <FreshnessBadge lastVerifiedAt={daysBefore(12)} now={DEMO_NOW} />
        <FreshnessBadge lastVerifiedAt={daysBefore(89)} now={DEMO_NOW} />
        <FreshnessBadge lastVerifiedAt={daysBefore(90)} now={DEMO_NOW} />
        <FreshnessBadge lastVerifiedAt={daysBefore(200)} now={DEMO_NOW} />
      </Example>

      <Example title="Linked to source" note="With sourceUrl, the badge links to the official page in a new tab.">
        <FreshnessBadge lastVerifiedAt={daysBefore(30)} now={DEMO_NOW} sourceUrl="https://example.org/demo-source" />
      </Example>

      <Example title="Small">
        <FreshnessBadge size="sm" lastVerifiedAt={daysBefore(5)} now={DEMO_NOW} />
        <FreshnessBadge size="sm" lastVerifiedAt={daysBefore(140)} now={DEMO_NOW} />
      </Example>
    </>
  )
}
