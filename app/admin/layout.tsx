import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"

import { markStaffDevice } from "@/lib/admin/internal"
import { can, ROLE_LABEL, type Permission } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } }

const LINKS: [href: string, label: string, permission: Permission][] = [
  ["/admin", "Overview", "overview"],
  ["/admin/users", "Users", "users.read"],
  ["/admin/emailed-reports", "Emailed reports", "users.read"],
  ["/admin/feedback", "Suggestions and feedback", "overview"],
  ["/admin/review", "Review queue", "content"],
  ["/admin/reports", "Error reports", "content"],
  ["/admin/visa-rules", "Visa rules", "content"],
  ["/admin/fx", "Exchange rates", "content"],
  ["/admin/estimates", "Flights and health", "content"],
  ["/admin/ai-usage", "AI usage", "ai"],
  ["/admin/advisor", "Advisor monitor", "ai"],
  ["/admin/payments", "Payments", "payments"],
  ["/admin/settings", "Settings", "settings"],
  ["/admin/audit", "Audit log", "audit"],
  ["/admin/system", "System", "settings"],
  ["/admin/diagnostics", "Diagnostics", "settings"],
]

/**
 * Every admin page sits behind this check: a staff role and a session verified with two-factor. Each page
 * also checks its own permission, and every admin API checks again on the server.
 */
async function StaffOnly({ children }: { children: React.ReactNode }) {
  await connection()
  const { user, role } = await requireStaff()
  await markStaffDevice((await cookies()).toString())
  return (
    <>
      <nav aria-label="Admin" className="flex flex-wrap items-center gap-3 text-sm font-medium">
        {LINKS.filter(([, , permission]) => can(user, permission)).map(([href, label]) => (
          <Link key={href} href={href} className="underline-offset-4 hover:underline">
            {label}
          </Link>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {user.email} · {ROLE_LABEL[role]}
        </span>
      </nav>
      {children}
    </>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <StaffOnly>{children}</StaffOnly>
      </Suspense>
    </div>
  )
}
