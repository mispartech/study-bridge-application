import Link from "next/link"
import type * as React from "react"
import { ChevronRight } from "lucide-react"

type Crumb = { href: string; label: string }

/** Every admin page starts with this: breadcrumbs, the page's one h1, a one-line description and actions. */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-2" data-slot="page-header">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-heading text-xl font-bold break-words sm:text-2xl">{title}</h1>
          {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** The trail back up, for pages whose heading lives in their own component. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((c) => (
          <li key={c.href} className="flex items-center gap-1">
            <Link href={c.href} className="underline-offset-4 hover:text-ink hover:underline">
              {c.label}
            </Link>
            <ChevronRight className="size-3.5" aria-hidden />
          </li>
        ))}
      </ol>
    </nav>
  )
}
