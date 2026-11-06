import type { Metadata } from "next"
import { CircleAlert, CircleCheck, CircleX, GraduationCap, MapPin } from "lucide-react"

import { Chip } from "@/components/ui/chip"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "Chip" }

export default function ChipPage() {
  return (
    <>
      <DemoHeader title="Chip">
        Status chips pair colour with an icon and wording, so meaning never depends on colour alone.
      </DemoHeader>

      <Example
        title="Status variants"
        code={`<Chip variant="success" icon={<CircleCheck />}>Meets requirements</Chip>`}
      >
        <Chip variant="success" icon={<CircleCheck aria-hidden />}>
          Meets requirements
        </Chip>
        <Chip variant="warning" icon={<CircleAlert aria-hidden />}>
          Deadline soon
        </Chip>
        <Chip variant="danger" icon={<CircleX aria-hidden />}>
          Over budget
        </Chip>
      </Example>

      <Example title="Other variants">
        <Chip>Neutral</Chip>
        <Chip variant="primary" icon={<GraduationCap aria-hidden />}>
          MSc
        </Chip>
        <Chip variant="outline" icon={<MapPin aria-hidden />}>
          Demo City
        </Chip>
      </Example>

      <Example title="Small">
        <Chip size="sm" variant="success">
          Strong
        </Chip>
        <Chip size="sm" variant="primary">
          Good
        </Chip>
        <Chip size="sm" variant="warning">
          Reach
        </Chip>
      </Example>

      <Example title="Truncation" note="Long labels truncate inside narrow containers instead of overflowing.">
        <div className="w-40">
          <Chip variant="primary">Demo Faculty of Data Science and Artificial Intelligence</Chip>
        </div>
      </Example>
    </>
  )
}
