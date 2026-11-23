import { connection } from "next/server"

import { ContentHome } from "@/components/admin/home/content-home"
import { Overview } from "@/components/admin/home/overview"
import { SupportHome } from "@/components/admin/home/support-home"
import { includeInternal } from "@/lib/admin/internal"
import { homeFor } from "@/lib/admin/nav"
import type { SearchParams } from "@/lib/admin/table"
import { can } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"

/**
 * The role-based home. Every staff role may open it (each home only shows what that role is allowed to see):
 * admins get the Overview, support a support desk, data editors a content desk. Pages a role can't open send
 * staff back here with ?denied=1.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  const { user, role } = await requireStaff()
  const params = await searchParams
  const home = homeFor(role)
  const now = new Date()
  return (
    <>
      {params.denied && <DeniedNote />}
      {home === "overview" && can(user, "overview") && (
        <Overview
          path="/admin"
          params={params}
          internal={includeInternal(flat(params), user)}
          canToggle={can(user, "roles")}
        />
      )}
      {home === "support" && can(user, "users.read") && <SupportHome params={params} now={now} />}
      {home === "content" && can(user, "content") && <ContentHome params={params} now={now} />}
    </>
  )
}

const flat = (params: SearchParams) =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))

function DeniedNote() {
  return (
    <p role="alert" className="rounded-button bg-warning-tint p-3 text-sm text-warning-strong">
      Your role doesn&apos;t include that page. Ask an admin if you need it.
    </p>
  )
}
