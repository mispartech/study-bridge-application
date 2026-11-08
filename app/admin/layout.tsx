import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { currentUser } from "@/lib/auth/server"
import { isAdmin } from "@/lib/auth/roles"

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } }

const LINKS = [
  ["/admin/review", "Review queue"],
  ["/admin/reports", "Error reports"],
  ["/admin/visa-rules", "Visa rules"],
  ["/admin/fx", "Exchange rates"],
  ["/admin/estimates", "Flights and health"],
  ["/admin/ai-usage", "AI usage"],
  ["/admin/diagnostics", "Diagnostics"],
] as const

/** Every admin page sits behind this role check, and children only render if it passes. */
async function AdminOnly({ children }: { children: React.ReactNode }) {
  await connection()
  const user = await currentUser()
  if (!user) redirect("/sign-in?next=/admin")
  if (!isAdmin(user)) notFound()
  return children
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <nav aria-label="Admin" className="flex flex-wrap gap-3 text-sm font-medium">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="underline-offset-4 hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AdminOnly>{children}</AdminOnly>
      </Suspense>
    </div>
  )
}
