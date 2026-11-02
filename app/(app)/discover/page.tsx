import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Discover" }

export default function Page() {
  return (
    <PlaceholderPage
      title="Discover"
      description="Programmes matched to your grades, budget and preferences will appear here."
    />
  )
}
