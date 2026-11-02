import type { Metadata } from "next"

import { ProgressRing } from "@/components/ui/progress-ring"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "ProgressRing" }

export default function ProgressRingPage() {
  return (
    <>
      <DemoHeader title="ProgressRing">
        SVG ring exposed as role=&quot;progressbar&quot;. It animates with a CSS transition, so no JavaScript runs.
      </DemoHeader>

      <Example title="Values" code={`<ProgressRing value={3} max={8} label="Documents uploaded">3/8</ProgressRing>`}>
        <ProgressRing value={0} label="Demo progress, empty" />
        <ProgressRing value={35} label="Demo progress, a third" />
        <ProgressRing value={70} label="Demo progress, most" />
        <ProgressRing value={100} label="Demo progress, complete" tone="success" />
      </Example>

      <Example title="Custom centre and max">
        <ProgressRing value={3} max={8} label="Demo documents uploaded" size={72}>
          3/8
        </ProgressRing>
        <ProgressRing value={5} max={6} label="Demo checklist steps" size={72} tone="success">
          5/6
        </ProgressRing>
      </Example>

      <Example title="Tones and sizes">
        <ProgressRing value={60} tone="primary" size={44} strokeWidth={4} label="Primary tone" />
        <ProgressRing value={60} tone="success" size={56} strokeWidth={5} label="Success tone" />
        <ProgressRing value={60} tone="warning" size={64} label="Warning tone" />
        <ProgressRing value={60} tone="danger" size={80} strokeWidth={8} label="Danger tone" />
        <ProgressRing value={60} tone="neutral" size={96} strokeWidth={8} label="Neutral tone" />
      </Example>
    </>
  )
}
