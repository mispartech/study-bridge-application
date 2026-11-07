import { connection } from "next/server"

import { VisaRuleForm } from "@/components/admin/visa-rule-form"
import { serviceClient } from "@/lib/db/service"

export default async function Page() {
  await connection()
  const { data } = await serviceClient()
    .from("visa_rule")
    .select("*")
    .eq("is_demo", false)
    .order("country")
    .order("rule_type")
    .order("effective_from", { ascending: false })
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-lg font-bold">Visa rules</h1>
      <p className="text-sm text-muted-foreground">
        Saving marks a rule as verified today, so check it on the official page first.
      </p>
      <VisaRuleForm rule={null} />
      {(data ?? []).map((rule) => (
        <VisaRuleForm key={rule.id} rule={rule} />
      ))}
    </div>
  )
}
