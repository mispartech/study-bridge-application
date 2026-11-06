import type { Metadata } from "next"

import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "Tokens" }

const BRAND = [
  { name: "ink", cls: "bg-ink" },
  { name: "canvas", cls: "bg-canvas" },
  { name: "surface", cls: "bg-surface" },
  { name: "primary", cls: "bg-primary" },
  { name: "accent", cls: "bg-accent" },
  { name: "success", cls: "bg-success" },
  { name: "warning", cls: "bg-warning" },
  { name: "danger", cls: "bg-danger" },
  { name: "muted", cls: "bg-muted-foreground" },
]

const DERIVED = [
  { name: "primary-strong", cls: "bg-primary-strong" },
  { name: "success-strong", cls: "bg-success-strong" },
  { name: "warning-strong", cls: "bg-warning-strong" },
  { name: "danger-strong", cls: "bg-danger-strong" },
  { name: "primary-tint", cls: "bg-primary-tint" },
  { name: "success-tint", cls: "bg-success-tint" },
  { name: "warning-tint", cls: "bg-warning-tint" },
  { name: "danger-tint", cls: "bg-danger-tint" },
  { name: "surface-subtle", cls: "bg-surface-subtle" },
  { name: "border", cls: "bg-border" },
]

function Swatches({ items }: { items: { name: string; cls: string }[] }) {
  return (
    <ul className="grid w-full grid-cols-3 gap-3 sm:grid-cols-5">
      {items.map(({ name, cls }) => (
        <li key={name} className="flex flex-col gap-1.5">
          <span className={`h-12 rounded-button border border-border ${cls}`} aria-hidden />
          <code className="truncate text-xs">{name}</code>
        </li>
      ))}
    </ul>
  )
}

export default function TokensPage() {
  return (
    <>
      <DemoHeader title="Tokens">
        Defined once in styles/tokens.css and mapped in tailwind.config.ts. Values swap under the .dark class, so no
        component needs dark: colour overrides.
      </DemoHeader>

      <Example title="Brand colours" note="From CLAUDE.md (light). Dark values are in styles/tokens.css.">
        <Swatches items={BRAND} />
      </Example>

      <Example
        title="Derived colours"
        note="Strong shades carry status text at ≥ 4.5:1; tints are chip and banner backgrounds."
      >
        <Swatches items={DERIVED} />
      </Example>

      <Example title="Type" className="flex-col items-start gap-2">
        <p className="font-heading text-3xl font-extrabold">Plus Jakarta Sans 800</p>
        <p className="font-heading text-xl font-bold">Plus Jakarta Sans 700: headings</p>
        <p>Inter 400: body text for descriptions and long-form content.</p>
        <p className="text-sm text-muted-foreground">Inter 400, muted: secondary information.</p>
        <p className="money text-lg font-semibold">.money → 1,111,111 / 9,999,999 (tabular figures align in columns)</p>
      </Example>

      <Example title="Radius and spacing" note="Cards 16px, buttons 12px. Spacing on an 8px grid (Tailwind 2 = 8px).">
        <span className="grid size-20 place-items-center rounded-card border border-border bg-surface-subtle text-xs">
          card 16
        </span>
        <span className="grid h-11 place-items-center rounded-button bg-primary px-4 text-xs text-primary-foreground">
          button 12
        </span>
        {[2, 4, 6, 8].map((n) => (
          <span key={n} className="flex flex-col items-center gap-1 text-xs">
            <span className="block bg-accent" style={{ width: n * 4, height: n * 4 }} aria-hidden />
            {n * 4}px
          </span>
        ))}
      </Example>
    </>
  )
}
