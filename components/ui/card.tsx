import * as React from "react"

import { cn } from "@/lib/utils"

type CardProps = React.ComponentProps<"div"> & {
  /** Adds hover/press feedback for cards that are a single tap target. */
  interactive?: boolean
}

function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-card border border-border bg-card p-4 text-card-foreground shadow-[0_1px_2px_rgb(21_19_43/0.04)] sm:p-6",
        interactive &&
          "transition-[box-shadow,transform] hover:shadow-[0_4px_16px_rgb(21_19_43/0.08)] active:translate-y-px",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

/** Defaults to h3; pass `as` to keep heading levels sequential for the page it sits in. */
function CardTitle({ className, as: Tag = "h3", ...props }: React.ComponentProps<"h3"> & { as?: "h2" | "h3" | "h4" }) {
  return (
    <Tag data-slot="card-title" className={cn("font-heading text-lg leading-snug font-bold", className)} {...props} />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("flex flex-col gap-3", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
