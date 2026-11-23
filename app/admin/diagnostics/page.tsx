import { connection } from "next/server"

import { PageHeader } from "@/components/admin/page-header"
import { SentryTest } from "@/components/admin/sentry-test"
import { requireStaff } from "@/lib/auth/staff-page"

export default async function Page() {
  await connection()
  await requireStaff("settings")
  return (
    <>
      <PageHeader
        title="Diagnostics"
        description="Sends a test error from the server and from this browser. Both should appear in Sentry within a minute."
      />
      <SentryTest />
    </>
  )
}
