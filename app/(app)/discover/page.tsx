import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { loadAccount } from "@/lib/account/current-account"
import { PreviewCard } from "@/components/match/preview-card"
import { ResultsView } from "@/components/match/results-view"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { hasSessionCookie } from "@/lib/auth/server"
import { rank } from "@/lib/match"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { inCountries } from "@/lib/match/countries"
import { COMPLETENESS_COOKIE, parseProfileCookie, PROFILE_COOKIE } from "@/lib/match/draft"
import { BAND_LABEL } from "@/lib/match/labels"
import { presentResult } from "@/lib/match/present"
import type { MatchProfile } from "@/lib/match/types"

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

/** What a new account still needs for precise matches. Empty means the setup is complete. */
function missingSetup(profile: MatchProfile): string[] {
  const missing: string[] = []
  const hasEnglish = [profile.ielts, profile.toefl, profile.pte, profile.duolingo].some((s) => s !== null)
  if (!hasEnglish && profile.tests_planned.length === 0) missing.push("Your English test, or the one you plan to take")
  if (profile.budget_total_minor === null) missing.push("Your total budget")
  if (profile.preferred_countries.length === 0) missing.push("The countries you're considering")
  if (!profile.target_term) missing.push("When you'd like to start")
  if (profile.cgpa === null && !profile.degree_class) missing.push("Your degree result")
  return missing
}

/** Shown once, straight after the email link: the account exists, and here's what's left to set up. */
function Welcome({ missing }: { missing: string[] }) {
  return (
    <Card data-testid="welcome" className="mb-4 gap-2 border-success/40">
      <h2 className="font-heading text-lg font-bold">Your account is ready</h2>
      <p className="text-sm">Your email is verified and everything you entered is saved to your account.</p>
      {missing.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your setup is complete. Your matches below use all of it.</p>
      ) : (
        <>
          <p className="text-sm font-medium">Finish your setup for more precise matches:</p>
          <ul className="list-disc pl-5 text-sm">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Button asChild className="self-start">
            <Link href="/onboarding">Finish setup</Link>
          </Button>
        </>
      )}
    </Card>
  )
}

/** Rendered on the server from the profile cookie, so first results arrive with the page. */
async function Results({ welcome }: { welcome: boolean }) {
  await connection()
  const store = await cookies()
  const account = hasSessionCookie(store.getAll()) ? await loadAccount() : null
  const profile = account?.profile ?? parseProfileCookie(store.get(PROFILE_COOKIE)?.value)
  if (!profile) return <NoProfile />
  const score = account?.completeness ?? store.get(COMPLETENESS_COOKIE)?.value
  const demoMode = demoModeEnabled()
  const catalogue = await loadCatalogue(demoMode)
  const now = new Date()
  const view = presentResult(rank(profile, catalogue, { now, demoMode }), profile, catalogue, now)
  const previewCards = inCountries(view.ranked, profile.preferred_countries)
  return (
    <>
      {welcome && account && <Welcome missing={missingSetup(profile)} />}
      <ResultsView
        initialProfile={profile}
        accountSaved={account?.saved ?? null}
        profileScore={score === undefined || Number.isNaN(Number(score)) ? null : Number(score)}
        dataScore={view.data_confidence}
        grades={view.band ? `${BAND_LABEL[view.band]} (${view.grades_source})` : null}
        counts={{
          ranked: view.ranked.length + view.more.length,
          closest: view.near_misses.length,
          restricted: view.restricted.length,
        }}
        preview={
          previewCards.length > 0 ? (
            <div className="flex flex-col gap-4">
              {previewCards.slice(0, PREVIEW_CARDS).map((card) => (
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
    </>
  )
}

export default function Page({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Finding your matches…</p>}>
      <WithParams searchParams={searchParams} />
    </Suspense>
  )
}

async function WithParams({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams
  return <Results welcome={welcome === "1"} />
}
