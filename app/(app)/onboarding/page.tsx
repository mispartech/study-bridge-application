import type { Metadata } from "next"

import { Wizard } from "@/components/onboarding/wizard"

export const metadata: Metadata = { title: "Your profile" }

export default function Page() {
  return <Wizard />
}
