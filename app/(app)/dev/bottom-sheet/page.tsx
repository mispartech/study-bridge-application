import type { Metadata } from "next"

import { DemoHeader, Example } from "../_components/showcase"
import { BasicSheetDemo, FilterSheetDemo } from "./sheet-demos"

export const metadata: Metadata = { title: "BottomSheet" }

export default function BottomSheetPage() {
  return (
    <>
      <DemoHeader title="BottomSheet">
        Radix Dialog for accessibility, Framer Motion for the slide and drag. The motion code loads when the sheet first
        opens, keeping it out of the initial bundle. Full width on phones, 512px max from sm up.
      </DemoHeader>

      <Example
        title="Uncontrolled with trigger"
        code={`<BottomSheet trigger={<Button>Open</Button>} title="…" description="…">\n  …\n</BottomSheet>`}
      >
        <BasicSheetDemo />
      </Example>

      <Example title="Controlled, with sticky footer and scrolling body">
        <FilterSheetDemo />
      </Example>
    </>
  )
}
