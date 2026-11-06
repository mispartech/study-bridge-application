import type { Metadata } from "next"

import { VISA_STATUSES, VisaStatusChip } from "@/components/ui/visa-status-chip"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "VisaStatusChip" }

export default function VisaStatusChipPage() {
  return (
    <>
      <DemoHeader title="VisaStatusChip">
        Presents the visa_rule outcome for the student&apos;s nationality. The status always comes from the database;
        this component only maps it to colour, icon and wording. Destinations below are placeholders.
      </DemoHeader>

      <Example title="Statuses" code={`<VisaStatusChip status={rule.status} country={rule.country_name} />`}>
        {VISA_STATUSES.map((status) => (
          <VisaStatusChip key={status} status={status} />
        ))}
      </Example>

      <Example title="With destination">
        <VisaStatusChip status="open" country="Country A" />
        <VisaStatusChip status="conditional" country="Country B" />
        <VisaStatusChip status="suspended" country="Country C" />
      </Example>

      <Example title="Custom label and small size">
        <VisaStatusChip size="sm" status="open" label="Demo visa type available" />
        <VisaStatusChip size="sm" status="unknown" />
      </Example>
    </>
  )
}
