import Link from "next/link"

import { Chip } from "@/components/ui/chip"
import { COUNTRY_LABEL } from "@/lib/match/labels"
import type { CostView, ProgrammeSummary } from "@/lib/match/present"

// Shared by the server-rendered preview and the interactive card, so they look the same.

export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

export function BudgetChip({ cost }: { cost: Pick<CostView, "affordability"> }) {
  if (cost.affordability === "within") {
    return (
      <Chip variant="success" size="sm">
        Within budget
      </Chip>
    )
  }
  if (cost.affordability === "stretch") {
    return (
      <Chip variant="warning" size="sm">
        Stretch
      </Chip>
    )
  }
  if (cost.affordability === "out_of_reach") {
    return (
      <Chip variant="danger" size="sm">
        Out of reach
      </Chip>
    )
  }
  return <Chip size="sm">Budget not set</Chip>
}

export function Crest({ name }: { name: string }) {
  const initials = name
    .replace(/^Demo — /, "")
    .split(/\s+/)
    .filter((word) => /^[A-ZÉ]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-button bg-primary-tint font-heading text-sm font-bold text-primary-strong"
    >
      {initials}
    </span>
  )
}

export function ProgrammeHeading({ programme }: { programme: ProgrammeSummary }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Crest name={programme.university} />
      <div className="min-w-0">
        <h3 className="font-heading text-base leading-snug font-bold">
          <Link href={`/programmes/${programme.id}`} className="underline-offset-4 hover:underline">
            {programme.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {programme.university.replace(/^Demo — /, "")}, {programme.city}, {COUNTRY_LABEL[programme.country]}
        </p>
      </div>
    </div>
  )
}
