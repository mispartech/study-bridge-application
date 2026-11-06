"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense } from "react"

import { cn } from "@/lib/utils"
import { isActive, NAV_ITEMS } from "./nav-items"

type Orientation = "horizontal" | "vertical"

function NavList({ orientation, pathname }: { orientation: Orientation; pathname: string }) {
  return (
    <ul className={cn("flex", orientation === "horizontal" ? "h-full items-stretch justify-around" : "flex-col gap-2")}>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <li key={href} className={cn(orientation === "horizontal" && "flex-1")}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                orientation === "horizontal" ? "h-full min-h-14" : "h-16 w-16 rounded-card",
                active ? "text-primary-strong" : "text-muted-foreground hover:text-ink"
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-14 place-items-center rounded-full transition-colors",
                  active ? "bg-primary-tint" : "group-hover:bg-surface-subtle"
                )}
              >
                <Icon className="size-5" aria-hidden strokeWidth={active ? 2.4 : 2} />
              </span>
              {label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function ActiveNavList({ orientation }: { orientation: Orientation }) {
  return <NavList orientation={orientation} pathname={usePathname()} />
}

/** Shared by the mobile bottom bar and the desktop rail; only the layout differs. */
export function NavLinks({ orientation }: { orientation: Orientation }) {
  // Dynamic routes don't know the path while prerendering, so links render first and the highlight follows.
  return (
    <Suspense fallback={<NavList orientation={orientation} pathname="" />}>
      <ActiveNavList orientation={orientation} />
    </Suspense>
  )
}
