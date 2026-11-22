import Link from "next/link"

/**
 * Admins only: staff and test accounts are left out of the numbers by default. This link puts them back
 * (or takes them out again), keeping the chosen date range. Works without JavaScript.
 */
export function InternalToggle({ path, query, included }: { path: string; query: string; included: boolean }) {
  const href = `${path}?${[query, included ? "" : "internal=1"].filter(Boolean).join("&")}`
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="internal-toggle">
      <span className="text-muted-foreground">
        {included ? "Including staff and test accounts." : "Staff and test accounts are left out."}
      </span>
      <Link href={href} className="font-medium underline underline-offset-4">
        {included ? "Leave them out" : "Include internal"}
      </Link>
    </p>
  )
}
