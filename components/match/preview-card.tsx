import { CalendarClock } from "lucide-react"

import { Card } from "@/components/ui/card"
import { FitRing } from "@/components/ui/fit-ring"
import type { CardView } from "@/lib/match/present"
import { formatShort } from "@/lib/money"

import { BudgetChip, dateLabel, ProgrammeHeading } from "./card-parts"
import { IncludesEstimates } from "./estimated-tag"

/**
 * Plain server-rendered card. On a slow connection this is what the student sees first: it carries
 * no client props, so it arrives ahead of the interactive list that replaces it.
 */
export function PreviewCard({ card }: { card: CardView }) {
  return (
    <Card data-testid="match-card" className="gap-3">
      <div className="flex items-start justify-between gap-2">
        <ProgrammeHeading programme={card} />
        <FitRing score={card.fit} band={card.group} size="sm" showLabel />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-h-11 items-center money text-xl font-bold">
          {formatShort(BigInt(card.cost.total_ngn_market), "NGN")}
        </span>
        <BudgetChip cost={card.cost} />
      </div>
      <IncludesEstimates />
      <p className="flex items-center gap-1.5 text-sm">
        <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          Next deadline {dateLabel(card.next_deadline.date)}
          <span className="text-muted-foreground"> ({card.days_to_deadline} days)</span>
        </span>
      </p>
    </Card>
  )
}
