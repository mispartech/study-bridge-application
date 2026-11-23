import type { Metadata } from "next"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"

import { AdminShell } from "@/components/admin/shell/admin-shell"
import { LoadingSkeleton } from "@/components/admin/states"
import { markStaffDevice } from "@/lib/admin/internal"
import { environmentLabel, NAV_COOKIE, navFor } from "@/lib/admin/nav"
import { can, ROLE_LABEL } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } }

/**
 * Every admin page sits behind this check: a staff role and a session verified with two-factor. Each page
 * also checks its own permission, and every admin API checks again on the server. The sidebar shows only
 * what this role can reach, worked out here on the server.
 */
async function StaffOnly({ children }: { children: React.ReactNode }) {
  await connection()
  const { user, role } = await requireStaff()
  const jar = await cookies()
  await markStaffDevice(jar.toString())
  return (
    <AdminShell
      groups={navFor(user)}
      staff={{ email: user.email ?? user.id, role: ROLE_LABEL[role] }}
      environment={environmentLabel(process.env.VERCEL_ENV)}
      showAlerts={can(user, "overview")}
      initiallyCollapsed={jar.get(NAV_COOKIE)?.value === "collapsed"}
    >
      {children}
    </AdminShell>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl p-4">
          <LoadingSkeleton rows={4} label="Loading the admin" />
        </div>
      }
    >
      <StaffOnly>{children}</StaffOnly>
    </Suspense>
  )
}
