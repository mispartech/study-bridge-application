import { connection } from "next/server"

import { PageHeader } from "@/components/admin/page-header"
import { VisaRuleForm } from "@/components/admin/visa-rule-form"
import { serviceClient } from "@/lib/db/service"
import { requireStaff } from "@/lib/auth/staff-page"

export default async function Page() {
  await connection()
  await requireStaff("content")
  const { data } = await serviceClient()
    .from("visa_rule")
    .select("*")
    .eq("is_demo", false)
    .order("country")
    .order("rule_type")
    .order("effective_from", { ascending: false })
  return (
    <>
      <PageHeader
        title="Visa rules"
        description="Restrictions by nationality and destination. Saving marks a rule as verified today, so check it on the official page first."
      />
      <VisaRuleForm rule={null} />
      {(data ?? []).map((rule) => (
        <VisaRuleForm key={rule.id} rule={rule} />
      ))}
    </>
  )
}
