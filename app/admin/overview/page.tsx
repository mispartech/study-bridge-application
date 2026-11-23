import { connection } from "next/server"

import { Overview } from "@/components/admin/home/overview"
import { includeInternal } from "@/lib/admin/internal"
import type { SearchParams } from "@/lib/admin/table"
import { can } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"

/** The Overview on its own page, for support (whose home is the support desk). Admins see it on /admin. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  const { user } = await requireStaff("overview")
  const params = await searchParams
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  return (
    <Overview
      path="/admin/overview"
      params={params}
      internal={includeInternal(flat, user)}
      canToggle={can(user, "roles")}
    />
  )
}
