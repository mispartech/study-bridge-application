export type DevEntry = { slug: string; name: string; summary: string }

export const DEV_ENTRIES: readonly DevEntry[] = [
  { slug: "tokens", name: "Tokens", summary: "Colour, type, radius and spacing tokens in light and dark." },
  { slug: "button", name: "Button", summary: "Variants, sizes, loading and link buttons." },
  { slug: "chip", name: "Chip", summary: "Compact labels with success, warning and danger status variants." },
  { slug: "card", name: "Card", summary: "16px-radius surface with header, content and footer slots." },
  { slug: "bottom-sheet", name: "BottomSheet", summary: "Accessible modal sheet with drag-to-dismiss." },
  { slug: "progress-ring", name: "ProgressRing", summary: "Circular progress for checklists and steps." },
  { slug: "fit-ring", name: "FitRing", summary: "0–100 fit score with Strong, Good and Reach bands." },
  { slug: "money", name: "Money", summary: "Formats NGN, GBP, CAD and USD from integer minor units." },
  {
    slug: "freshness-badge",
    name: "FreshnessBadge",
    summary: "How recently a record was verified: green under 90 days, amber after.",
  },
  {
    slug: "visa-status-chip",
    name: "VisaStatusChip",
    summary: "Presents a visa_rule outcome for the student's nationality.",
  },
]
