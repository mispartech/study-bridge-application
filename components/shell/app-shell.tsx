import { CircleUser } from "lucide-react"
import Link from "next/link"

import { ThemeToggle } from "@/components/theme-toggle"
import { NavLinks } from "./nav-links"

export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-button font-heading text-lg font-extrabold tracking-tight"
    >
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="10" className="fill-primary" />
        <path
          d="M7 20c4-6 14-6 18 0"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-primary-foreground"
        />
        <circle cx="16" cy="12" r="3" className="fill-accent" />
      </svg>
      StudyBridge
    </Link>
  )
}

/**
 * Mobile: sticky top bar + fixed bottom nav. Desktop (md+): top bar + fixed side rail.
 * Server component; only the nav links (active state) and theme toggle hydrate.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[60] rounded-button bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {/* Solid background: backdrop-blur is costly to paint while scrolling on low-end Android. */}
      <header className="sticky top-0 z-40 border-b border-border bg-canvas pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between gap-2 px-4 md:pl-28">
          <Logo />
          <div className="flex items-center gap-1">
            <Link
              href="/account"
              aria-label="Your account"
              className="flex size-11 items-center justify-center rounded-button hover:bg-surface-subtle"
            >
              <CircleUser className="size-5" aria-hidden />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="fixed top-0 bottom-0 left-0 z-30 hidden w-24 border-r border-border bg-surface pt-20 md:block"
      >
        <div className="flex justify-center">
          <NavLinks orientation="vertical" />
        </div>
      </nav>

      <main
        id="main"
        className="mx-auto w-full max-w-5xl px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12 md:pl-28"
      >
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="h-16">
          <NavLinks orientation="horizontal" />
        </div>
      </nav>
    </div>
  )
}
