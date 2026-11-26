import Link from "next/link"
import type * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download } from "lucide-react"

import {
  PAGE_SIZE,
  paginate,
  paramNames,
  parseTableState,
  sortHref,
  sortRows,
  tableHref,
  type SearchParams,
  type SortValue,
} from "@/lib/admin/table"
import { cn } from "@/lib/utils"

export type Column<T> = {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  /** Makes the column sortable, by this value. */
  sort?: (row: T) => SortValue
  align?: "left" | "right"
  nowrap?: boolean
  className?: string
  /** Can't be hidden from the Columns menu. The first column never can. */
  fixed?: boolean
}

type DataTableProps<T> = {
  /** Accessible name of the table region. */
  label: string
  columns: readonly Column<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  /** Extra attributes per row, such as a data-testid. */
  rowProps?: (row: T) => React.HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, string | undefined>
  /** Where the page lives, and its current params, so sort and page links keep the other filters. */
  path: string
  params: SearchParams
  /** Distinguishes two tables on one page in the URL. */
  prefix?: string
  defaultSort?: string
  defaultDir?: "asc" | "desc"
  pageSize?: number
  /** The audited CSV export for this data, if there is one. */
  exportHref?: string
  empty?: React.ReactNode
  caption?: string
  /** Wide tables scroll sideways on tablets; under 640px every table becomes a list of cards. */
  minWidth?: string
}

/**
 * The admin table: sorting, pagination and column visibility on the server, kept in the URL; a sticky header;
 * and under 640px each row becomes a card with its column names beside the values. One set of markup for both,
 * so tests and screen readers see each row once.
 */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowProps,
  path,
  params,
  prefix = "",
  defaultSort,
  defaultDir = "desc",
  pageSize = PAGE_SIZE,
  exportHref,
  empty,
  caption,
  minWidth = "40rem",
}: DataTableProps<T>) {
  const hideable = columns
    .slice(1)
    .filter((c) => !c.fixed)
    .map((c) => c.key)
  const state = parseTableState(params, {
    prefix,
    sortable: columns.filter((c) => c.sort).map((c) => c.key),
    hideable,
    defaultSort: defaultSort ?? null,
    defaultDir,
  })
  const visible = columns.filter((c) => !state.hidden.has(c.key))
  const sortColumn = columns.find((c) => c.key === state.sort)
  const page = paginate(sortRows(rows, sortColumn?.sort, state.dir), state.page, pageSize)
  const n = paramNames(prefix)

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">{empty ?? "Nothing to show."}</div>
  }

  return (
    <div className="flex flex-col gap-2" data-slot="data-table">
      {(hideable.length > 0 || exportHref) && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          {hideable.length > 0 && (
            <details className="relative max-sm:hidden">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-button border border-border bg-surface px-3 font-medium">
                <Columns3 className="size-4" aria-hidden />
                Columns
              </summary>
              <form
                method="get"
                action={path}
                className="absolute right-0 z-20 mt-1 flex w-56 flex-col gap-1 rounded-card border border-border bg-surface p-3 shadow-lg"
              >
                {Object.entries(params).flatMap(([key, value]) =>
                  key === n.show || key === n.cols || key === n.page
                    ? []
                    : (Array.isArray(value) ? value : value === undefined ? [] : [value]).map((v, i) => (
                        <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
                      ))
                )}
                <input type="hidden" name={n.cols} value="1" />
                {columns.slice(1).map((c) => (
                  <label key={c.key} className="flex min-h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      name={n.show}
                      value={c.key}
                      defaultChecked={!state.hidden.has(c.key)}
                      disabled={c.fixed}
                    />
                    {c.header || c.key}
                  </label>
                ))}
                <button
                  type="submit"
                  className="mt-1 min-h-9 rounded-button bg-primary px-3 font-medium text-primary-foreground"
                >
                  Show these
                </button>
              </form>
            </details>
          )}
          {exportHref && (
            <a
              href={exportHref}
              className="flex min-h-9 items-center gap-1.5 rounded-button border border-border bg-surface px-3 font-medium"
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          )}
        </div>
      )}

      <div
        className={cn(
          "rounded-card border border-border bg-surface max-sm:border-0 max-sm:bg-transparent sm:overflow-x-auto",
          page.rows.length > 25 && "sm:max-h-[70vh] sm:overflow-y-auto"
        )}
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        <table
          className="w-full text-left text-sm tabular-nums max-sm:block sm:min-w-(--table-min)"
          style={{ "--table-min": minWidth } as React.CSSProperties}
        >
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="text-muted-foreground max-sm:sr-only">
            <tr>
              {visible.map((c) => {
                const sorted = state.sort === c.key
                const Icon = !sorted ? ArrowUpDown : state.dir === "asc" ? ArrowUp : ArrowDown
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sorted ? (state.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "sticky top-0 z-10 h-admin-row border-b border-border bg-surface px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4",
                      c.align === "right" && "text-right"
                    )}
                  >
                    {c.sort ? (
                      <Link
                        href={sortHref(path, params, state, c.key, prefix)}
                        scroll={false}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-ink",
                          sorted && "text-ink",
                          c.align === "right" && "flex-row-reverse"
                        )}
                      >
                        {c.header}
                        <Icon className="size-3.5" aria-hidden />
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
            {page.rows.map((row) => (
              <tr
                key={rowKey(row)}
                {...rowProps?.(row)}
                className="border-t border-border align-top first:border-t-0 max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:rounded-card max-sm:border max-sm:bg-surface max-sm:p-3 max-sm:first:border-t"
              >
                {visible.map((c, i) => (
                  <td
                    key={c.key}
                    data-label={c.header}
                    className={cn(
                      "px-3 py-2 first:pl-4 last:pr-4",
                      c.nowrap && "sm:whitespace-nowrap",
                      c.align === "right" && "sm:text-right",
                      // Phone: the first column is the card's title, the rest are "name: value" lines.
                      i === 0
                        ? "max-sm:p-0 max-sm:font-semibold"
                        : "max-sm:grid max-sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] max-sm:gap-2 max-sm:p-0 max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)] max-sm:empty:hidden",
                      c.className
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {page.pages > 1 && (
        <nav aria-label={`${label} pages`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {page.from}–{page.to} of {page.total}
          </span>
          <span className="flex gap-2">
            {page.page > 1 && (
              <Link
                href={tableHref(path, params, { [n.page]: page.page === 2 ? null : String(page.page - 1) })}
                className="grid min-h-9 place-items-center rounded-button border border-border bg-surface px-3 font-medium"
              >
                Previous
              </Link>
            )}
            {page.page < page.pages && (
              <Link
                href={tableHref(path, params, { [n.page]: String(page.page + 1) })}
                className="grid min-h-9 place-items-center rounded-button border border-border bg-surface px-3 font-medium"
              >
                Next
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  )
}
