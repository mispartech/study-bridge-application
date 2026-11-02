"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { DEV_ENTRIES } from "./registry"

/** Horizontally scrolling component switcher; scrolls rather than wraps on a 360px screen. */
export function DevNav() {
  const pathname = usePathname()
  const items = [{ slug: "", name: "All" }, ...DEV_ENTRIES]

  return (
    <nav aria-label="Components" className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4">
      <ul className="flex w-max gap-2 pb-1">
        {items.map(({ slug, name }) => {
          const href = slug ? `/dev/${slug}` : "/dev"
          const active = pathname === href
          return (
            <li key={href}>
              <Link
                href={href}
                // Eleven always-visible links: prefetching them all competes with first load on 3G.
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-surface text-ink hover:bg-surface-subtle"
                )}
              >
                {name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
