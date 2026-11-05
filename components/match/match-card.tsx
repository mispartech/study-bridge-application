"use client"

import { Bookmark, CalendarClock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Chip } from "@/components/ui/chip"
import { FitRing } from "@/components/ui/fit-ring"
import { FreshnessBadge } from "@/components/ui/freshness-badge"
import { VisaStatusChip } from "@/components/ui/visa-status-chip"
import type { CardView } from "@/lib/match/present"
import { formatShort, type FxRates } from "@/lib/money"

import { BudgetChip, dateLabel, ProgrammeHeading } from "./card-parts"
import { CostSheet } from "./cost-sheet"
import { IncludesEstimates } from "./estimated-tag"

export type Explanation = { why: string; watch_out: string | null }

type MatchCardProps = {
  card: CardView
  fx: { market: FxRates; official: FxRates }
  now: Date
  explanation?: Explanation
  explaining: boolean
  saved: boolean
  onSave: () => void
  compared: boolean
  compareDisabled: boolean
  onCompare: () => void
}

export function MatchCard({
  card,
  fx,
  now,
  explanation,
  explaining,
  saved,
  onSave,
  compared,
  compareDisabled,
  onCompare,
}: MatchCardProps) {
  return (
    <Card data-testid="match-card" className="gap-3">
      <div className="flex items-start justify-between gap-2">
        <ProgrammeHeading programme={card} />
        <FitRing score={card.fit} band={card.group} size="sm" showLabel />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CostSheet title={card.title} cost={card.cost} fx={fx}>
          <span className="money text-xl font-bold">{formatShort(BigInt(card.cost.total_ngn_market), "NGN")}</span>
        </CostSheet>
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

      <div className="flex flex-wrap gap-1.5">
        {card.has_coop && <Chip size="sm">Co-op or placement</Chip>}
        {card.flags.includes("related_field") && <Chip size="sm">Related field</Chip>}
        {card.flags.includes("check_test_requirement") && <Chip size="sm">Check test requirement</Chip>}
        {card.rules_changing && (
          <VisaStatusChip
            status="conditional"
            size="sm"
            label={`Rules changing ${dateLabel(card.rules_changing.date)}`}
            title={card.rules_changing.label}
          />
        )}
        <FreshnessBadge lastVerifiedAt={card.last_verified_at} now={now} sourceUrl={card.source_url} size="sm" />
      </div>

      {explanation ? (
        <div data-testid="explanation" className="flex flex-col gap-1 text-sm">
          <p>{explanation.why}</p>
          {explanation.watch_out && <p className="font-medium text-warning-strong">{explanation.watch_out}</p>}
        </div>
      ) : (
        explaining && (
          <div data-testid="explanation-skeleton" aria-hidden className="flex flex-col gap-2 py-1">
            <span className="h-3 w-full animate-pulse rounded-full bg-surface-subtle" />
            <span className="h-3 w-2/3 animate-pulse rounded-full bg-surface-subtle" />
          </div>
        )
      )}

      <div className="flex flex-wrap items-center gap-2">
        {card.apply_url && (
          <Button asChild size="sm" variant="primary">
            <a href={card.apply_url} target="_blank" rel="noopener noreferrer">
              Apply
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" aria-pressed={saved} onClick={onSave}>
          <Bookmark className={saved ? "fill-current" : undefined} aria-hidden />
          {saved ? "Saved" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" aria-pressed={compared} disabled={compareDisabled} onClick={onCompare}>
          {compared ? "In compare" : "Compare"}
        </Button>
      </div>
    </Card>
  )
}
