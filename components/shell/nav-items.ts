import { Bookmark, Compass, ListChecks, MessageCircle, type LucideIcon } from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/shortlist", label: "Shortlist", icon: Bookmark },
  { href: "/advisor", label: "Advisor", icon: MessageCircle },
  { href: "/plan", label: "Plan", icon: ListChecks },
]

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
