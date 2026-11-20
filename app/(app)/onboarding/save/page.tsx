import type { Metadata } from "next"
import { Suspense } from "react"

import { SignInForm } from "@/components/account/sign-in-form"
import { JourneySteps } from "@/components/journey/journey-steps"

export const metadata: Metadata = { title: "Save your results" }

/**
 * Step 3 of 3. Optional: an email verifies the account, which is created when the link is opened, and the
 * student lands on their dashboard to finish setting up. Skipping goes straight to the results.
 */
export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <JourneySteps current={3} />
      <Suspense fallback={<p className="text-sm text-muted-foreground">One moment…</p>}>
        <SignInForm
          reasonKey="results"
          nextPath="/discover?welcome=1"
          skip={{ href: "/discover", label: "Skip for now and see my matches" }}
        />
      </Suspense>
    </div>
  )
}
