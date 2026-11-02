import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Heights follow the 8px grid; `md` (44px) is the minimum comfortable touch target.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-button font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        secondary: "bg-surface-subtle text-ink hover:bg-track",
        outline: "border border-border bg-surface text-ink hover:bg-surface-subtle",
        ghost: "text-ink hover:bg-surface-subtle",
        danger: "bg-danger-tint text-danger-strong hover:bg-danger/20",
        link: "h-auto px-0 text-primary-strong underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-[0.9375rem]",
        lg: "h-13 px-6 text-base",
        icon: "size-11",
      },
      block: { true: "w-full" },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "primary"}
      className={cn(buttonVariants({ variant, size, block, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants, type ButtonProps }
