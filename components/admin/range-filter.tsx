import Link from "next/link"

import { PRESETS, type Range } from "@/lib/admin/range"
import { cn } from "@/lib/utils"

const input = "min-h-11 rounded-button border border-border bg-surface px-3 text-sm"
const LABEL: Record<keyof typeof PRESETS, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
}

/** Preset ranges as links, plus custom dates. Works without JavaScript. */
export function RangeFilter({ path, range, exportHref }: { path: string; range: Range; exportHref?: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
        <Link
          key={p}
          href={`${path}?range=${p}`}
          aria-current={range.preset === p ? "true" : undefined}
          className={cn(
            "grid min-h-11 place-items-center rounded-button border px-3",
            range.preset === p ? "border-primary bg-primary-tint font-semibold" : "border-border"
          )}
        >
          {LABEL[p]}
        </Link>
      ))}
      <form method="get" action={path} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          From
          <input type="date" name="from" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          To
          <input type="date" name="to" className={input} />
        </label>
        <button type="submit" className={`${input} font-medium`}>
          Apply
        </button>
      </form>
      {exportHref && (
        <a href={exportHref} className={`${input} ml-auto grid place-items-center font-medium`}>
          Export CSV
        </a>
      )}
    </div>
  )
}
