import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Shortlist" }

export default function Page() {
  return (
    <PlaceholderPage
      title="Shortlist"
      description="Programmes you save will appear here, with costs in naira and deadlines."
    />
  )
}
