import { connection } from "next/server"

import { PageHeader } from "@/components/admin/page-header"
import { EmptyState } from "@/components/admin/states"
import { requireStaff } from "@/lib/auth/staff-page"

/** Placeholder until Phase 2 of docs/ADMIN_REVAMP_PLAN.md adds the alerts engine and its own permissions. */
export default async function Page() {
  await connection()
  await requireStaff("overview")
  return (
    <>
      <PageHeader title="Alerts" description="Failed jobs, email problems, review backlog, stale data and AI spend." />
      <EmptyState
        title="Alerts aren't switched on yet"
        description="They arrive in the next phase of the admin revamp. Until then, check System for scheduled jobs and Emailed reports for delivery."
      />
    </>
  )
}
