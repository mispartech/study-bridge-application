import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Advisor" }

export default function Page() {
  return (
    <PlaceholderPage
      title="Advisor"
      description="Ask questions about programmes, costs and visas. Answers will cite official sources."
    />
  )
}
