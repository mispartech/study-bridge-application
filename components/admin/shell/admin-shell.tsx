"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import {
  Bell,
  Bot,
  ChartColumn,
  ChevronsLeft,
  ChevronsRight,
  CircleGauge,
  Coins,
  CreditCard,
  Flag,
  House,
  Inbox,
  ListChecks,
  Mail,
  Menu,
  MessageSquareText,
  PiggyBank,
  Plane,
  Route,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"

import { SignOutButton } from "@/components/account/sign-out-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { activeHref, NAV_COOKIE, type NavGroup, type NavIcon } from "@/lib/admin/nav"
import { cn } from "@/lib/utils"

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  overview: ChartColumn,
  alerts: Bell,
  users: Users,
  mail: Mail,
  feedback: MessageSquareText,
  review: ListChecks,
  flag: Flag,
  passport: ShieldCheck,
  currency: Coins,
  plane: Plane,
  payments: CreditCard,
  ai: Sparkles,
  advisor: Bot,
  settings: Settings,
  audit: ScrollText,
  system: Server,
  diagnostics: Stethoscope,
  pathways: Route,
  funding: PiggyBank,
}

type Staff = { email: string; role: string }

/**
 * The admin frame: a 240px sidebar (collapsible to icons, remembered in a cookie) with the groups this role
 * can reach, and a top bar with search, alerts, the environment and the staff menu. Under 768px the sidebar
 * becomes a slide-over menu. The groups arrive already filtered on the server.
 */
export function AdminShell({
  groups,
  staff,
  environment,
  showAlerts,
  initiallyCollapsed,
  children,
}: {
  groups: NavGroup[]
  staff: Staff
  environment: "Production" | "Preview" | "Local"
  showAlerts: boolean
  initiallyCollapsed: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(initiallyCollapsed)
  const [shownFor, setShownFor] = React.useState(pathname)
  const menuButton = React.useRef<HTMLButtonElement>(null)
  const current = activeHref(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href))
  )

  // Navigating closes the phone menu (adjusting state during render, as React recommends over an effect).
  if (shownFor !== pathname) {
    setShownFor(pathname)
    setOpen(false)
  }

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/admin; max-age=31536000; samesite=lax`
  }

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      <a
        href="#admin-main"
        className="sr-only z-[60] rounded-button bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          className="fixed inset-0 z-40 bg-scrim md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="admin-sidebar"
        data-collapsed={collapsed || undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(85vw,var(--sb-admin-sidebar))] shrink-0 flex-col border-r border-border bg-surface transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0 md:transition-[width]",
          open ? "translate-x-0" : "max-md:invisible max-md:-translate-x-full",
          collapsed ? "md:w-16" : "md:w-admin-sidebar"
        )}
      >
        <div className="flex h-admin-topbar shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <Link href="/admin" className={cn("font-heading font-extrabold", collapsed && "md:sr-only")}>
            StudyBridge <span className="font-medium text-muted-foreground">admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid size-11 place-items-center rounded-button hover:bg-surface-subtle md:hidden"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Close menu</span>
          </button>
        </div>

        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group.key} className="mb-2 flex flex-col gap-0.5">
              <h2
                className={cn(
                  "px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                  collapsed && "md:sr-only"
                )}
              >
                {group.label}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon]
                  const active = item.href === current
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex min-h-9 items-center gap-3 rounded-button px-3 text-sm font-medium hover:bg-surface-subtle",
                          active && "bg-primary-tint text-primary-strong hover:bg-primary-tint",
                          collapsed && "md:justify-center md:px-0"
                        )}
                      >
                        <Icon className="size-4.5 shrink-0" aria-hidden />
                        <span className={cn("truncate", collapsed && "md:sr-only")}>{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          className="hidden h-11 shrink-0 items-center gap-2 border-t border-border px-4 text-sm text-muted-foreground hover:text-ink md:flex"
        >
          {collapsed ? (
            <ChevronsRight className="size-4" aria-hidden />
          ) : (
            <ChevronsLeft className="size-4" aria-hidden />
          )}
          <span className={cn(collapsed && "sr-only")}>{collapsed ? "Expand menu" : "Collapse menu"}</span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-admin-topbar items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-4">
          <button
            ref={menuButton}
            type="button"
            aria-expanded={open}
            aria-controls="admin-sidebar"
            onClick={() => setOpen(true)}
            className="grid size-11 place-items-center rounded-button hover:bg-surface-subtle md:hidden"
          >
            <Menu className="size-5" aria-hidden />
            <span className="sr-only">Open menu</span>
          </button>

          <label className="relative hidden max-w-sm flex-1 sm:block">
            <span className="sr-only">Search (coming soon)</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              disabled
              placeholder="Search — coming soon"
              className="h-10 w-full rounded-button border border-border bg-surface-subtle pr-3 pl-9 text-sm disabled:cursor-not-allowed"
            />
          </label>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <span
              data-testid="environment"
              className={cn(
                "inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold",
                environment === "Production" && "bg-danger-tint text-danger-strong",
                environment === "Preview" && "bg-warning-tint text-warning-strong",
                environment === "Local" && "bg-primary-tint text-primary-strong"
              )}
            >
              {environment}
            </span>
            {showAlerts && (
              <Link
                href="/admin/alerts"
                className="grid size-11 place-items-center rounded-button hover:bg-surface-subtle"
              >
                <Bell className="size-5" aria-hidden />
                <span className="sr-only">Alerts</span>
              </Link>
            )}
            <StaffMenu staff={staff} />
          </div>
        </header>

        <main
          id="admin-main"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 outline-none sm:px-6 sm:py-6"
        >
          {children}
        </main>
      </div>
    </div>
  )
}

function StaffMenu({ staff }: { staff: Staff }) {
  return (
    <details className="relative" data-testid="staff-menu">
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-button hover:bg-surface-subtle">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-primary-tint text-sm font-bold text-primary-strong uppercase"
        >
          {staff.email.slice(0, 1)}
        </span>
        <span className="sr-only">Staff menu</span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 flex w-72 flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-lg">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold break-all">{staff.email}</p>
          <p className="text-sm text-muted-foreground">{staff.role}</p>
          <p className="inline-flex items-center gap-1 text-xs text-success-strong">
            <CircleGauge className="size-3.5" aria-hidden />
            Two-factor verified for this session
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
        <Link href="/discover" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
          <Inbox className="size-4" aria-hidden />
          Student site
        </Link>
      </div>
    </details>
  )
}
