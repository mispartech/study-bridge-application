import type { Metadata } from "next"
import Link from "next/link"

import { QuickMatch } from "@/components/match/quick-match"
import { Logo } from "@/components/shell/app-shell"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "StudyBridge: your Master's abroad, matched to your grades and your budget",
  description:
    "Match your grades and naira budget to Master's programmes in the UK and Canada, with official apply links.",
}

export default function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-4 pb-10">
      <header className="flex items-center justify-between gap-2">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl leading-tight font-extrabold">
            Your Master&apos;s abroad, matched to your grades and your budget.
          </h1>
          <p className="text-muted-foreground">Three questions. Real programmes, with the full cost in naira.</p>
        </div>
        <QuickMatch />
        <p className="text-center text-sm">
          Already started?{" "}
          <Link href="/discover" className="font-medium underline underline-offset-4">
            See your matches
          </Link>
        </p>
      </main>
    </div>
  )
}
