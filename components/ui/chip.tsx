import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Status colours are tints with a darker text shade so labels stay ≥ 4.5:1 in both themes.
// Never rely on colour alone: pair status chips with an icon or explicit wording.
const chipVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 rounded-full font-medium whitespace-nowrap [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        neutral: "bg-surface-subtle text-ink",
        primary: "bg-primary-tint text-primary-strong",
        success: "bg-success-tint text-success-strong",
        warning: "bg-warning-tint text-warning-strong",
        danger: "bg-danger-tint text-danger-strong",
        outline: "border border-border text-ink",
      },
      size: {
        sm: "h-6 px-2 text-xs",
        md: "h-8 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
)

type ChipProps = React.ComponentProps<"span"> &
  VariantProps<typeof chipVariants> & {
    icon?: React.ReactNode
  }

function Chip({ className, variant, size, icon, children, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      data-variant={variant ?? "neutral"}
      className={cn(chipVariants({ variant, size, className }))}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

export { Chip, chipVariants, type ChipProps }
