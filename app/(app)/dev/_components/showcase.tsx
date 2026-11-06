import { cn } from "@/lib/utils"

/** Page header for a component demo. */
export function DemoHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
      {children && <p className="max-w-prose text-muted-foreground">{children}</p>}
    </header>
  )
}

/** One labelled example: a title, optional note, and the rendered component on a surface. */
export function Example({
  title,
  note,
  code,
  className,
  children,
}: {
  title: string
  note?: React.ReactNode
  /** Short usage snippet shown under the preview. */
  code?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold">{title}</h2>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      <div
        className={cn("flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4", className)}
      >
        {children}
      </div>
      {code && (
        // Focusable so keyboard users can scroll snippets that overflow on narrow screens.
        <pre
          tabIndex={0}
          aria-label={`${title} code example`}
          className="overflow-x-auto rounded-button bg-surface-subtle p-3 text-xs leading-relaxed"
        >
          <code>{code}</code>
        </pre>
      )}
    </section>
  )
}
