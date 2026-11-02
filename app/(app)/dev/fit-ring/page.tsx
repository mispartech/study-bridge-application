import type { Metadata } from "next"

import { FitRing } from "@/components/ui/fit-ring"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "FitRing" }

export default function FitRingPage() {
  return (
    <>
      <DemoHeader title="FitRing">
        Shows a 0–100 fit score. The band (Strong, Good or Reach) comes from rank() as a prop rather than score
        thresholds, so the ring can never disagree with the matching engine.
      </DemoHeader>

      <Example title="Bands" code={`<FitRing score={result.fit} band={result.group} showLabel />`}>
        <FitRing score={88} band="strong" showLabel />
        <FitRing score={67} band="good" showLabel />
        <FitRing score={41} band="reach" showLabel />
        <FitRing score={55} />
      </Example>

      <Example title="Sizes">
        <FitRing score={74} band="good" size="sm" />
        <FitRing score={74} band="good" size="md" />
        <FitRing score={74} band="good" size="lg" showLabel />
      </Example>

      <Example title="Clamping" note="Out-of-range or non-numeric input renders safely.">
        <FitRing score={-10} />
        <FitRing score={140} />
        <FitRing score={Number.NaN} />
      </Example>
    </>
  )
}
