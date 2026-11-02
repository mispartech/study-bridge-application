import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Plan" }

export default function Page() {
  return <PlaceholderPage title="Plan" description="Your application checklist and deadlines will appear here." />
}
