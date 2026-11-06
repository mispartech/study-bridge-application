import * as React from "react"

import { formatMoney, type Currency, type FormatMoneyOptions } from "@/lib/money"
import { cn } from "@/lib/utils"

type MoneyProps = Omit<React.ComponentProps<"data">, "value" | "children"> &
  FormatMoneyOptions & {
    /** Integer amount in minor units (kobo, pence, cents), exactly as stored in the DB. */
    amountMinor: bigint | number
    currency: Currency
  }

/**
 * Renders a stored amount. It only formats; conversion between currencies uses FX rates
 * from the database and happens before this component.
 */
function Money({ amountMinor, currency, fraction, compact, className, ...props }: MoneyProps) {
  return (
    <data
      data-slot="money"
      value={`${amountMinor.toString()} ${currency}`}
      className={cn("money whitespace-nowrap", className)}
      {...props}
    >
      {formatMoney(amountMinor, currency, { fraction, compact })}
    </data>
  )
}

export { Money, type MoneyProps }
