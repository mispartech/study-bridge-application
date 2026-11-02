import { CircleCheck, CircleHelp, CircleSlash, TriangleAlert, type LucideIcon } from "lucide-react"

import { Chip, type ChipProps } from "@/components/ui/chip"

/**
 * Display states for a visa_rule outcome. The status itself always comes from the
 * database for the student's nationality; this component only presents it.
 */
export const VISA_STATUSES = ["open", "conditional", "suspended", "unknown"] as const
export type VisaStatus = (typeof VISA_STATUSES)[number]

const STATUS: Record<VisaStatus, { variant: NonNullable<ChipProps["variant"]>; icon: LucideIcon; label: string }> = {
  open: { variant: "success", icon: CircleCheck, label: "Visa route open" },
  conditional: { variant: "warning", icon: TriangleAlert, label: "Extra visa conditions" },
  suspended: { variant: "danger", icon: CircleSlash, label: "Visa issuance suspended" },
  unknown: { variant: "neutral", icon: CircleHelp, label: "Visa status unconfirmed" },
}

type VisaStatusChipProps = Omit<ChipProps, "variant" | "icon" | "children"> & {
  status: VisaStatus
  /** Destination shown before the status, e.g. "UK". */
  country?: string
  /** Overrides the default wording, e.g. with the visa type from the rule. */
  label?: string
}

function VisaStatusChip({ status, country, label, ...props }: VisaStatusChipProps) {
  const { variant, icon: Icon, label: defaultLabel } = STATUS[status]
  return (
    <Chip variant={variant} icon={<Icon aria-hidden />} data-visa-status={status} {...props}>
      {country ? `${country}: ` : ""}
      {label ?? defaultLabel}
    </Chip>
  )
}

export { VisaStatusChip, type VisaStatusChipProps }
