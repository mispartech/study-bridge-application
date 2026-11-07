"use client"

import * as React from "react"
import { FX_CLOSE_PERCENT, fxBuffer, fxClose } from "@/lib/match/fx-display"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ACCOMMODATION_LABEL } from "@/lib/match/labels"
import type { CostView } from "@/lib/match/present"
import { convertMinor, CURRENCIES, formatShort, type Currency, type FxRates } from "@/lib/money"
import { cn } from "@/lib/utils"

import { EstimatedTag } from "./estimated-tag"

const SEGMENT_CLASS = ["bg-primary", "bg-accent", "bg-success", "bg-warning", "bg-muted-foreground", "bg-ink"]

type CostSheetProps = {
  title: string
  cost: CostView
  fx: { market: FxRates; official: FxRates }
  /** Rendered as the button that opens the sheet. */
  children: React.ReactNode
}

/** Every money figure opens this: the breakdown, each line's source, and a currency toggle. */
export function CostSheet({ title, cost, fx, children }: CostSheetProps) {
  const [currency, setCurrency] = React.useState<Currency>("NGN")
  const show = (amount: string, from: Currency) => {
    const converted = convertMinor(BigInt(amount), from, currency, fx.market)
    return converted === null ? "Not available" : formatShort(converted, currency)
  }
  const total = BigInt(cost.total_minor)
  const lines = cost.lines.filter((l) => l.amount_minor !== "0")

  return (
    <BottomSheet
      title={`Cost breakdown: ${title}`}
      description="First-year total. Tap a source to check it."
      trigger={
        <button
          type="button"
          data-testid="cost-trigger"
          className="min-h-11 rounded-button text-left underline decoration-dotted underline-offset-4"
        >
          {children}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Currency" className="grid grid-cols-4 gap-1 rounded-button bg-surface-subtle p-1">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === currency}
              onClick={() => setCurrency(c)}
              className={cn(
                "h-11 rounded-button text-sm font-medium",
                c === currency ? "bg-primary text-primary-foreground" : "text-ink"
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
          {lines.map((l, i) => (
            <span
              key={l.key}
              className={SEGMENT_CLASS[i % SEGMENT_CLASS.length]}
              style={{ width: `${Number((BigInt(l.amount_minor) * 1000n) / total) / 10}%` }}
            />
          ))}
        </div>

        <ul className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.key} className="flex items-start justify-between gap-3 text-sm">
              <span className="flex flex-col items-start gap-1">
                <span>{l.label}</span>
                {l.estimated && <EstimatedTag />}
                {l.source_url.startsWith("http") && (
                  <a href={l.source_url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                    Source
                  </a>
                )}
              </span>
              <span className="money font-medium whitespace-nowrap">{show(l.amount_minor, l.currency)}</span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-3 font-semibold">
            <dt>Total first year</dt>
            <dd className="money">{show(cost.total_minor, cost.currency)}</dd>
          </div>
          {fxClose(cost) ? (
            <div data-testid="fx-buffer" className="flex justify-between gap-3 text-muted-foreground">
              <dt>Mid-market and market rates are within {FX_CLOSE_PERCENT}%. Allow a buffer of</dt>
              <dd className="money">{formatShort(fxBuffer(cost), "NGN")}</dd>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <dt>At the market rate</dt>
                <dd className="money">{formatShort(BigInt(cost.total_ngn_market), "NGN")}</dd>
              </div>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <dt>At the mid-market rate</dt>
                <dd className="money">{formatShort(BigInt(cost.total_ngn_official), "NGN")}</dd>
              </div>
            </>
          )}
          {cost.proof_of_funds_minor && (
            <div className="flex justify-between gap-3 text-muted-foreground">
              <dt>Visa proof of funds</dt>
              <dd className="money">{show(cost.proof_of_funds_minor, cost.currency)}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          Based on {ACCOMMODATION_LABEL[cost.accommodation] ?? cost.accommodation}
          {cost.accommodation_available ? "" : ", the cheapest option we have for this city"}.
        </p>
      </div>
    </BottomSheet>
  )
}
