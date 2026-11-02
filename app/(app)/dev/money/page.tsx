import type { Metadata } from "next"

import { Money } from "@/components/ui/money"
import { CURRENCIES } from "@/lib/money"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "Money" }

// Arbitrary demo amounts in minor units; not real fees and not FX conversions of each other.
const ROWS: { label: string; minor: bigint }[] = [
  { label: "Whole amount", minor: 1_850_000n },
  { label: "With minor units", minor: 1_850_050n },
  { label: "Large", minor: 4_250_000_000n },
  { label: "Zero", minor: 0n },
  { label: "Negative (refund)", minor: -125_000n },
]

export default function MoneyPage() {
  return (
    <>
      <DemoHeader title="Money">
        Takes the integer minor-unit amount stored in the DB plus a currency code. It uses bigint internally, so large
        kobo values stay exact. It only formats: converting with FX rates from the DB happens before this component.
        Tabular figures keep columns aligned.
      </DemoHeader>

      <Example
        title="All currencies"
        note="Same arbitrary minor-unit values in each currency (not conversions)."
        className="block"
      >
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Money formatting table, scrolls sideways"
        >
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">Money formatting by currency</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Case
                </th>
                {CURRENCIES.map((c) => (
                  <th key={c} scope="col" className="py-2 pl-4 text-right font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    {row.label}
                  </th>
                  {CURRENCIES.map((c) => (
                    <td key={c} className="py-2 pl-4 text-right">
                      <Money amountMinor={row.minor} currency={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Example>

      <Example title="Options" code={`<Money amountMinor={4_250_000_000n} currency="NGN" compact />`}>
        <span className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">compact</span>
          <Money amountMinor={4_250_000_000n} currency="NGN" compact className="text-lg font-semibold" />
        </span>
        <span className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">fraction=&quot;always&quot;</span>
          <Money amountMinor={1_850_000n} currency="GBP" fraction="always" className="text-lg font-semibold" />
        </span>
        <span className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">fraction=&quot;never&quot;</span>
          <Money amountMinor={1_850_050n} currency="USD" fraction="never" className="text-lg font-semibold" />
        </span>
      </Example>

      <Example title="Headline" note="NGN first, with the source currency as secondary (demo values).">
        <div className="flex flex-col">
          <Money amountMinor={4_250_000_000n} currency="NGN" className="font-heading text-3xl font-extrabold" />
          <span className="text-sm text-muted-foreground">
            ≈ <Money amountMinor={2_100_000n} currency="GBP" /> · demo rate
          </span>
        </div>
      </Example>
    </>
  )
}
