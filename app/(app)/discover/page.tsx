import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { PreviewCard } from "@/components/match/preview-card"
import { ResultsView } from "@/components/match/results-view"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { rank } from "@/lib/match"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { COMPLETENESS_COOKIE, matchConfidence, parseProfileCookie, PROFILE_COOKIE } from "@/lib/match/draft"
import { BAND_LABEL } from "@/lib/match/labels"
import { presentResult } from "@/lib/match/present"

export const metadata: Metadata = { title: "Your matches" }

const PREVIEW_CARDS = 3

function NoProfile() {
  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="text-2xl font-extrabold">Let&apos;s find your matches</h1>
      <p className="text-sm text-muted-foreground">
        Tell us about your grades, tests and budget. It takes about five minutes.
      </p>
      <Button asChild block>
        <Link href="/onboarding">Start</Link>
      </Button>
    </Card>
  )
}

/** Rendered on the server from the profile cookie, so first results arrive with the page. */
async function Results() {
  await connection()
  const store = await cookies()
  const profile = parseProfileCookie(store.get(PROFILE_COOKIE)?.value)
  if (!profile) return <NoProfile />
  const score = store.get(COMPLETENESS_COOKIE)?.value
  const demoMode = demoModeEnabled()
  const catalogue = await loadCatalogue(demoMode)
  const now = new Date()
  const view = presentResult(rank(profile, catalogue, { now, demoMode }), profile, catalogue, now)
  return (
    <ResultsView
      initialProfile={profile}
      confidence={matchConfidence(score === undefined ? null : Number(score))}
      grades={view.band ? `${BAND_LABEL[view.band]} (${view.grades_source})` : null}
      counts={{
        ranked: view.ranked.length + view.more.length,
        closest: view.near_misses.length,
        restricted: view.restricted.length,
      }}
      preview={
        view.ranked.length > 0 ? (
          <div className="flex flex-col gap-4">
            {view.ranked.slice(0, PREVIEW_CARDS).map((card) => (
              <PreviewCard key={card.id} card={card} />
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm">Nothing matches yet.</p>
          </Card>
        )
      }
    />
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Finding your matches…</p>}>
      <Results />
    </Suspense>
  )
}
